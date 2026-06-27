import chalk from 'chalk';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { SuperPlaneClient } from '../superplane/client.js';
import { buildCanvasSpec } from '../superplane/canvas-template.js';
import { loadConfig, saveConfig } from '../config.js';

function normalizeRepo(input) {
  if (!input) return '';
  const httpsMatch = input.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?\/?$/);
  if (httpsMatch) return httpsMatch[1];
  const shortMatch = input.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/);
  if (shortMatch) return shortMatch[1];
  return input.replace(/\.git$/, '');
}

function ask(rl, question, defaultVal, envVar) {
  const envVal = envVar ? process.env[envVar] : undefined;
  if (envVal) return Promise.resolve(envVal);
  if (!rl || rl._closed) return Promise.resolve(defaultVal || '');
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
    ? null
    : createInterface({ input: process.stdin, output: process.stdout });

  console.log(chalk.bold.cyan('\n🏭 Software Factory — Setup\n'));

  if (nonInteractive) {
    console.log(chalk.dim('  Non-interactive mode: reading from environment variables\n'));
  } else {
    console.log([
      '  3 things needed: SuperPlane token · GitHub token · Render API key',
      '  No Anthropic key required — your AI agent handles code generation.',
      '',
    ].join('\n'));
  }

  const existing = loadConfig();

  try {
    // ── 1. SuperPlane ───────────────────────────────────────────────────────
    console.log(chalk.bold('1. SuperPlane'));
    const spKey = await ask(rl, '  API token (app.superplane.com → Profile → API Tokens)',
      existing.superplaneApiKey, 'SUPERPLANE_TOKEN');
    if (!spKey) {
      console.error(chalk.red('SuperPlane API token is required.'));
      rl?.close();
      process.exit(1);
    }

    const client = new SuperPlaneClient(spKey);
    process.stdout.write('  Verifying… ');
    const me = await client.getMe();
    console.log(chalk.green(`✔ Connected as ${me.user?.name || me.user?.id}`));

    // ── 2. GitHub ───────────────────────────────────────────────────────────
    console.log(chalk.bold('\n2. GitHub'));
    const githubToken = await ask(rl,
      '  Personal access token (github.com → Settings → Developer → PATs, needs repo scope)',
      existing.githubToken || '', 'GITHUB_TOKEN');

    if (githubToken) {
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${githubToken}`, 'User-Agent': 'software-factory' },
        });
        if (res.ok) {
          const user = await res.json();
          console.log(chalk.green(`  ✔ Authenticated as @${user.login}`));
        }
      } catch {}
    }

    // ── 3. Render ───────────────────────────────────────────────────────────
    console.log(chalk.bold('\n3. Render'));
    console.log(chalk.dim('  Get your key: https://dashboard.render.com/u/settings → API Keys'));
    const renderKey = await ask(rl, '  Render API key',
      existing.renderKey || '', 'RENDER_API_KEY');
    const renderServiceId = await ask(rl, '  Render service ID (optional — leave blank to auto-create per deployment)',
      existing.renderServiceId || '', 'RENDER_SERVICE_ID');

    // ── 4. Target Repo (optional) ───────────────────────────────────────────
    console.log(chalk.bold('\n4. Default Target Repository'));
    const rawRepo = await ask(rl,
      '  GitHub repo to build for (owner/repo or URL)',
      existing.targetRepo || 'superplanehq/superplane', 'FACTORY_TARGET_REPO');
    const targetRepo = normalizeRepo(rawRepo);
    if (rawRepo !== targetRepo) console.log(chalk.dim(`  → normalized to: ${targetRepo}`));

    // ── 5. Anthropic key (optional — for autonomous mode only) ──────────────
    console.log(chalk.bold('\n5. Anthropic API Key') + chalk.dim(' (optional)'));
    console.log(chalk.dim('  Only needed for autonomous mode (factory build without an AI agent).'));
    console.log(chalk.dim('  If you use Claude Code, Codex, or OpenCode — skip this.'));
    const anthropicKey = await ask(rl,
      '  Anthropic API key (press Enter to skip)',
      '', 'ANTHROPIC_API_KEY');

    // ── Store secrets in SuperPlane ─────────────────────────────────────────
    console.log(chalk.bold('\nStoring in SuperPlane…'));
    if (githubToken) await upsertSecret(client, 'github-token', githubToken);
    if (renderKey) await upsertSecret(client, 'render-api-key', renderKey);
    if (anthropicKey) await upsertSecret(client, 'anthropic-api-key', anthropicKey);

    // ── Canvas ──────────────────────────────────────────────────────────────
    let canvasId = existing.canvasId;
    if (!canvasId) {
      console.log(chalk.bold('\nCreating SuperPlane canvas…'));
      const spec = buildCanvasSpec({
        targetRepo,
        githubTokenSecret: 'github-token',
        renderApiKeySecret: 'render-api-key',
        anthropicApiKeySecret: 'anthropic-api-key',
        renderServiceId: renderServiceId || undefined,
      });
      const { canvas } = await client.createCanvas('software-factory', spec);
      canvasId = canvas.metadata.id;
      console.log(chalk.green(`  ✔ Canvas created (${canvasId})`));
      console.log(chalk.dim(`    https://app.superplane.com/canvases/${canvasId}`));
    } else {
      console.log(chalk.dim(`\n  Using existing canvas: ${canvasId.slice(0, 8)}…`));
    }

    // ── Save ────────────────────────────────────────────────────────────────
    saveConfig({
      superplaneApiKey: spKey,
      canvasId,
      canvasName: 'software-factory',
      canvasTriggerNodeId: 'start',
      canvasTemplateName: 'Build Issue',
      targetRepo,
      githubToken: githubToken || existing.githubToken,
      renderKey: renderKey || existing.renderKey,
      renderServiceId: renderServiceId || existing.renderServiceId,
    });

    console.log(chalk.green('\n✔ Configuration saved to ~/.factory/config.json'));

    // ── Auto-register MCP server ────────────────────────────────────────────
    console.log(chalk.bold('\nWiring up MCP server…'));

    // Claude Code
    let claudeOk = false;
    try {
      execSync('claude mcp add software-factory -- npx software-factory mcp', { stdio: 'pipe' });
      console.log(chalk.green('  ✔ Claude Code: MCP registered (claude mcp add software-factory)'));
      claudeOk = true;
    } catch {
      console.log(chalk.dim('  · Claude Code not found or already registered'));
    }

    // Write ~/.mcp.json for Codex / OpenCode / any MCP-compatible agent
    try {
      const mcpConfig = {
        mcpServers: {
          'software-factory': {
            command: 'npx',
            args: ['software-factory', 'mcp'],
          },
        },
      };
      const mcpPath = join(homedir(), '.mcp.json');
      writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
      console.log(chalk.green(`  ✔ Codex/OpenCode: ~/.mcp.json written`));
    } catch {
      console.log(chalk.dim('  · Could not write ~/.mcp.json'));
    }

    console.log(chalk.bold.cyan('\n🏭 Software Factory is ready!\n'));
    console.log('  Give your AI agent a GitHub URL and say:\n');
    console.log(chalk.bold('  "Use software-factory tools to build and deploy this:"'));
    console.log(chalk.cyan('  https://github.com/owner/repo'));
    console.log(chalk.dim('  (repo with SPEC.md, a specific .md file, or an issue URL)\n'));
    console.log(chalk.bold('The agent will:'));
    console.log('  1. fetch_github_spec   — read the spec/issue');
    console.log('  2. get_repo_structure  — explore the codebase');
    console.log('  3. [write code]        — implement it');
    console.log('  4. push_branch         — push to GitHub');
    console.log('  5. deploy_preview      — get a live Render URL in ~20s');
    console.log('  6. create_pr           — open PR + post preview link\n');
    if (!claudeOk) {
      console.log(chalk.bold('Manual MCP setup (one time per agent):'));
      console.log(`  Claude Code: ${chalk.cyan('claude mcp add software-factory -- npx software-factory mcp')}`);
      console.log(`  Codex/OpenCode: ${chalk.cyan('~/.mcp.json already written ✔')}\n`);
    }
    console.log(chalk.dim(`Canvas: https://app.superplane.com/canvases/${canvasId}\n`));

  } finally {
    rl?.close();
  }
}
