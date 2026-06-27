import chalk from 'chalk';
import { createInterface } from 'readline';
import { SuperPlaneClient } from '../superplane/client.js';
import { buildCanvasSpec } from '../superplane/canvas-template.js';
import { loadConfig, saveConfig } from '../config.js';

function prompt(rl, question, defaultVal) {
  return new Promise(resolve => {
    const q = defaultVal ? `${question} [${chalk.dim(defaultVal)}]: ` : `${question}: `;
    rl.question(q, answer => resolve(answer.trim() || defaultVal || ''));
  });
}

async function upsertSecret(client, name, value) {
  if (!value) return;
  try {
    const { secrets } = await client.listSecrets();
    const existing = secrets.find(s => s.name === name);
    if (existing) {
      console.log(chalk.dim(`  Secret "${name}" already exists, skipping.`));
      return;
    }
    await client.createSecret(name, value);
    console.log(chalk.green(`  ✔ Secret "${name}" created`));
  } catch (e) {
    console.log(chalk.yellow(`  ⚠ Could not create secret "${name}": ${e.message}`));
  }
}

export async function runInit() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(chalk.bold.cyan('\n🏭 Software Factory — Setup\n'));
  console.log('This wizard configures the Software Factory pipeline on SuperPlane.\n');

  const existing = loadConfig();

  try {
    // ── SuperPlane ──────────────────────────────────────────────────────────
    console.log(chalk.bold('SuperPlane'));
    const spKey = await prompt(rl, 'SuperPlane API token', existing.superplaneApiKey || process.env.SUPERPLANE_API_KEY);
    if (!spKey) { console.error(chalk.red('SuperPlane API token is required.')); process.exit(1); }

    const client = new SuperPlaneClient(spKey);
    process.stdout.write('  Verifying SuperPlane connection...');
    const me = await client.getMe();
    console.log(chalk.green(` ✔ Connected as ${me.user?.name || me.user?.id}`));

    // ── API Keys ────────────────────────────────────────────────────────────
    console.log(chalk.bold('\nAPI Keys (stored as SuperPlane secrets)'));
    const anthropicKey = await prompt(rl, 'Anthropic API key (for Claude)', existing.anthropicKeyHint || process.env.ANTHROPIC_API_KEY);
    const githubToken = await prompt(rl, 'GitHub personal access token', existing.githubTokenHint || process.env.GITHUB_TOKEN);
    const renderKey = await prompt(rl, 'Render API key (optional)', existing.renderKeyHint || process.env.RENDER_API_KEY);

    // ── Target Repo ─────────────────────────────────────────────────────────
    console.log(chalk.bold('\nTarget Repository'));
    const targetRepo = await prompt(rl, 'GitHub repo (owner/repo)', existing.targetRepo || 'superplanehq/superplane');

    // ── Render Service ──────────────────────────────────────────────────────
    let renderServiceId = existing.renderServiceId || '';
    if (renderKey) {
      renderServiceId = await prompt(rl, 'Render service ID (from Render dashboard)', existing.renderServiceId || '');
    }

    // ── Optional: Native Integration IDs ────────────────────────────────────
    console.log(chalk.bold('\nNative SuperPlane Integrations (optional — skips runners for these)'));
    console.log(chalk.dim('  Leave blank to use runner-based fallback (no integration needed)\n'));
    const claudeIntId = await prompt(rl, 'Claude integration ID', existing.claudeIntegrationId || '');
    const githubIntId = await prompt(rl, 'GitHub integration ID', existing.githubIntegrationId || '');
    const renderIntId = renderServiceId ? await prompt(rl, 'Render integration ID', existing.renderIntegrationId || '') : '';

    // ── Canvas Name ─────────────────────────────────────────────────────────
    const canvasName = await prompt(rl, '\nCanvas name', existing.canvasName || 'software-factory');

    // ── Create Secrets ──────────────────────────────────────────────────────
    console.log(chalk.bold('\nCreating SuperPlane secrets...'));
    await upsertSecret(client, 'anthropic-api-key', anthropicKey);
    await upsertSecret(client, 'github-token', githubToken);
    if (renderKey) await upsertSecret(client, 'render-api-key', renderKey);

    // ── Create Canvas ───────────────────────────────────────────────────────
    let canvasId = existing.canvasId;
    let canvasTriggerNodeId = existing.canvasTriggerNodeId || 'start';

    if (canvasId) {
      const recreate = await prompt(rl, `\nCanvas "${canvasName}" already exists (${canvasId.slice(0, 8)}...). Recreate? [y/N]`, 'n');
      if (recreate.toLowerCase() === 'y') canvasId = null;
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
      canvasTriggerNodeId = 'start';
      console.log(chalk.green(`  ✔ Canvas created: ${chalk.bold(canvasName)} (${canvasId})`));
      console.log(chalk.dim(`    View at: https://app.superplane.com/canvases/${canvasId}`));
    }

    // ── Save Config ─────────────────────────────────────────────────────────
    const config = {
      superplaneApiKey: spKey,
      canvasId,
      canvasName,
      canvasTriggerNodeId,
      targetRepo,
      renderServiceId: renderServiceId || undefined,
      claudeIntegrationId: claudeIntId || undefined,
      githubIntegrationId: githubIntId || undefined,
      renderIntegrationId: renderIntId || undefined,
      anthropicKeyHint: anthropicKey ? '***' : undefined,
      githubTokenHint: githubToken ? '***' : undefined,
      renderKeyHint: renderKey ? '***' : undefined,
    };

    saveConfig(config);
    console.log(chalk.green('\n✔ Configuration saved to ~/.factory/config.json'));

    console.log(chalk.bold.cyan('\n🏭 Software Factory is ready!\n'));
    console.log('Next steps:');
    console.log(`  ${chalk.cyan('factory doctor')}              Check everything is set up correctly`);
    console.log(`  ${chalk.cyan('factory build <issue-url>')}   Start the pipeline`);
    console.log(`  ${chalk.cyan('factory status')}              View pipeline status`);
    console.log();
    console.log(chalk.dim(`Canvas URL: https://app.superplane.com/canvases/${canvasId}`));
    console.log();

  } finally {
    rl.close();
  }
}
