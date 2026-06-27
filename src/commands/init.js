import chalk from 'chalk';
import { createInterface } from 'readline';
import { SuperPlaneClient } from '../superplane/client.js';
import { buildCanvasSpec } from '../superplane/canvas-template.js';
import { loadConfig, saveConfig } from '../config.js';

// Parse any GitHub URL or owner/repo format into "owner/repo"
function normalizeRepo(input) {
  if (!input) return '';
  // https://github.com/owner/repo.git  or  git@github.com:owner/repo.git
  const httpsMatch = input.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?\/?$/);
  if (httpsMatch) return httpsMatch[1];
  // owner/repo or owner/repo.git
  const shortMatch = input.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/);
  if (shortMatch) return shortMatch[1];
  return input.replace(/\.git$/, '');
}

// Read from stdin, env var, or return default
function ask(rl, question, defaultVal, envVar) {
  const envVal = envVar ? process.env[envVar] : undefined;
  if (envVal) return Promise.resolve(envVal);
  return new Promise(resolve => {
    const hint = defaultVal ? chalk.dim(` [${defaultVal}]`) : '';
    rl.question(`${question}${hint}: `, answer => resolve(answer.trim() || defaultVal || ''));
  });
}

async function upsertSecret(client, name, value) {
  if (!value) return;
  try {
    const exists = await client.secretExists(name);
    if (exists) {
      await client.setSecretKey(name, 'value', value);
      console.log(chalk.green(`  ✔ Secret "${name}" updated`));
    } else {
      await client.createSecret(name, value);
      console.log(chalk.green(`  ✔ Secret "${name}" created`));
    }
  } catch (e) {
    console.log(chalk.yellow(`  ⚠ Could not set secret "${name}": ${e.message}`));
  }
}

export async function runInit(options = {}) {
  const nonInteractive = options.yes || process.env.FACTORY_YES === '1';
  const rl = nonInteractive
    ? { question: (q, cb) => cb(''), close: () => {} }
    : createInterface({ input: process.stdin, output: process.stdout });

  console.log(chalk.bold.cyan('\n🏭 Software Factory — Setup\n'));
  if (nonInteractive) {
    console.log(chalk.dim('  Running in non-interactive mode (env vars / --yes flag)\n'));
  } else {
    console.log('This wizard configures the Software Factory pipeline on SuperPlane.\n');
  }

  const existing = loadConfig();

  try {
    // ── SuperPlane ──────────────────────────────────────────────────────────
    console.log(chalk.bold('SuperPlane'));
    const spKey = await ask(rl, 'SuperPlane API token',
      existing.superplaneApiKey, 'SUPERPLANE_TOKEN');
    if (!spKey) {
      console.error(chalk.red('SuperPlane API token is required. Set SUPERPLANE_TOKEN or enter it here.'));
      process.exit(1);
    }

    const client = new SuperPlaneClient(spKey);
    process.stdout.write('  Verifying SuperPlane connection...');
    const me = await client.getMe();
    const orgId = me.user?.organizationId;
    console.log(chalk.green(` ✔ Connected as ${me.user?.name || me.user?.id}`));

    // ── API Keys ────────────────────────────────────────────────────────────
    console.log(chalk.bold('\nAPI Keys (stored as SuperPlane secrets)'));
    const anthropicKey = await ask(rl, 'Anthropic API key (for Claude)',
      existing.anthropicKeyHint !== '***' ? existing.anthropicKeyHint : '', 'ANTHROPIC_API_KEY');
    const githubToken = await ask(rl, 'GitHub personal access token (repo scope)',
      existing.githubToken || '', 'GITHUB_TOKEN');
    const renderKey = await ask(rl, 'Render API key (optional, press Enter to skip)',
      existing.renderKey || '', 'RENDER_API_KEY');

    // ── Target Repo ─────────────────────────────────────────────────────────
    console.log(chalk.bold('\nTarget Repository'));
    const rawRepo = await ask(rl, 'GitHub repo to deploy (owner/repo or URL)',
      existing.targetRepo || 'superplanehq/superplane', 'FACTORY_TARGET_REPO');
    const targetRepo = normalizeRepo(rawRepo);
    if (rawRepo !== targetRepo) {
      console.log(chalk.dim(`  Normalized to: ${targetRepo}`));
    }

    // ── Render Service ──────────────────────────────────────────────────────
    let renderServiceId = existing.renderServiceId || '';
    if (renderKey) {
      renderServiceId = await ask(rl, 'Render service ID (from dashboard, optional)',
        existing.renderServiceId || '', 'RENDER_SERVICE_ID');
    }

    // ── Native Integration IDs (optional) ───────────────────────────────────
    const claudeIntId = await ask(rl, 'Claude integration ID (optional, leave blank)',
      existing.claudeIntegrationId || '', 'SUPERPLANE_CLAUDE_INTEGRATION_ID');
    const githubIntId = await ask(rl, 'GitHub integration ID (optional, leave blank)',
      existing.githubIntegrationId || '', 'SUPERPLANE_GITHUB_INTEGRATION_ID');
    const renderIntId = renderServiceId
      ? await ask(rl, 'Render integration ID (optional)', existing.renderIntegrationId || '', '')
      : '';

    // ── Canvas Name ─────────────────────────────────────────────────────────
    const canvasName = await ask(rl, '\nCanvas name',
      existing.canvasName || 'software-factory', 'FACTORY_CANVAS_NAME');

    // ── Create Secrets ──────────────────────────────────────────────────────
    console.log(chalk.bold('\nStoring secrets in SuperPlane...'));
    await upsertSecret(client, 'anthropic-api-key', anthropicKey);
    await upsertSecret(client, 'github-token', githubToken);
    if (renderKey) await upsertSecret(client, 'render-api-key', renderKey);

    // ── Create or reuse Canvas ──────────────────────────────────────────────
    let canvasId = existing.canvasId;

    if (canvasId && !nonInteractive) {
      const ans = await ask(rl, `\nCanvas "${canvasName}" already exists (${canvasId.slice(0, 8)}...). Recreate? [y/N]`, 'n', '');
      if (ans.toLowerCase() === 'y') canvasId = null;
    }

    if (!canvasId) {
      console.log(chalk.bold('\nCreating Software Factory canvas on SuperPlane...'));
      const spec = buildCanvasSpec({
        claudeIntegrationId: claudeIntId || undefined,
        githubIntegrationId: githubIntId || undefined,
        renderIntegrationId: renderIntId || undefined,
        renderServiceId: renderServiceId || undefined,
        targetRepo,
        anthropicApiKeySecret: 'anthropic-api-key',
        githubTokenSecret: 'github-token',
        renderApiKeySecret: 'render-api-key',
      });

      const { canvas } = await client.createCanvas(canvasName, spec);
      canvasId = canvas.metadata.id;
      console.log(chalk.green(`  ✔ Canvas created: ${chalk.bold(canvasName)} (${canvasId})`));
      console.log(chalk.dim(`    View: https://app.superplane.com/canvases/${canvasId}`));
    } else {
      console.log(chalk.dim(`\n  Using existing canvas: ${canvasId.slice(0, 8)}...`));
    }

    // ── Save Config ─────────────────────────────────────────────────────────
    const config = {
      superplaneApiKey: spKey,
      orgId,
      canvasId,
      canvasName,
      canvasTriggerNodeId: 'start',
      targetRepo,
      renderServiceId: renderServiceId || undefined,
      claudeIntegrationId: claudeIntId || undefined,
      githubIntegrationId: githubIntId || undefined,
      renderIntegrationId: renderIntId || undefined,
      // Store tokens locally for doctor checks
      githubToken: githubToken || undefined,
      renderKey: renderKey || undefined,
      anthropicKeyHint: anthropicKey ? '***' : undefined,
    };

    saveConfig(config);
    console.log(chalk.green('\n✔ Configuration saved to ~/.factory/config.json'));

    console.log(chalk.bold.cyan('\n🏭 Software Factory is ready!\n'));
    console.log('Next steps:');
    console.log(`  ${chalk.cyan('factory doctor')}              Verify everything is configured`);
    console.log(`  ${chalk.cyan('factory build <issue-url>')}   Trigger the pipeline`);
    console.log(`  ${chalk.cyan('factory status')}              Watch pipeline progress`);
    console.log();
    console.log(chalk.dim(`Canvas: https://app.superplane.com/canvases/${canvasId}`));
    console.log();

  } finally {
    rl.close();
  }
}
