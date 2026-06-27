import chalk from 'chalk';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { SuperPlaneClient } from '../superplane/client.js';
import { buildCanvasSpec } from '../superplane/canvas-template.js';
import { loadConfig, saveConfig } from '../config.js';

// Only prompt for a value if it isn't already set
function prompt(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

async function upsertSecret(client, name, value) {
  if (!value) return;
  try {
    const exists = await client.secretExists(name);
    if (exists) {
      await client.setSecretKey(name, 'value', value);
    } else {
      await client.createSecret(name, value);
    }
  } catch (e) {
    // non-fatal — secrets are nice-to-have for autonomous mode
    process.stderr.write(`  warn: could not set secret "${name}": ${e.message}\n`);
  }
}

async function getOrCreateCanvas(client, canvasId, targetRepo) {
  // Reuse existing canvas if we have its ID
  if (canvasId) {
    try {
      await client.getCanvas(canvasId);
      return canvasId;
    } catch {}
  }

  // Try to create a new one
  try {
    const spec = buildCanvasSpec({ targetRepo });
    const { canvas } = await client.createCanvas('software-factory', spec);
    return canvas.metadata.id;
  } catch (e) {
    if (e.message.includes('409') || e.message.toLowerCase().includes('already exists')) {
      // Canvas with this name exists — find it
      try {
        const { canvases } = await client.listCanvases();
        const found = (canvases || []).find(c => c.metadata?.name === 'software-factory');
        if (found) return found.metadata.id;
      } catch {}
    }
    throw e;
  }
}

export async function runInit(options = {}) {
  const existing = loadConfig();

  // Pre-fill from env or existing config
  let spKey    = existing.superplaneApiKey || process.env.SUPERPLANE_TOKEN || '';
  let ghToken  = existing.githubToken      || process.env.GITHUB_TOKEN     || '';
  let renderKey= existing.renderKey        || process.env.RENDER_API_KEY   || '';

  const nonInteractive = options.yes || process.env.FACTORY_YES === '1';

  console.log(chalk.bold.cyan('\n🏭 Software Factory — Setup\n'));

  const missing = [];
  if (!spKey)     missing.push('SuperPlane token');
  if (!ghToken)   missing.push('GitHub token');
  if (!renderKey) missing.push('Render API key');

  if (missing.length === 0) {
    console.log(chalk.dim('  All keys already configured. Verifying…\n'));
  } else if (nonInteractive) {
    console.error(chalk.red(`Missing required keys: ${missing.join(', ')}\n`));
    console.error('Set them as environment variables:');
    console.error('  SUPERPLANE_TOKEN, GITHUB_TOKEN, RENDER_API_KEY\n');
    process.exit(1);
  } else {
    console.log(`  Need ${missing.length} key${missing.length > 1 ? 's' : ''}:\n`);
  }

  const rl = (missing.length > 0 && !nonInteractive)
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    if (!spKey) {
      spKey = await prompt(rl, `  SuperPlane API token\n  → app.superplane.com → Profile → API Tokens\n  Token: `);
    }

    // Verify SuperPlane immediately
    process.stdout.write('  Connecting to SuperPlane… ');
    const client = new SuperPlaneClient(spKey);
    const me = await client.getMe();
    console.log(chalk.green(`✔ ${me.user?.name || me.user?.id}`));

    if (!ghToken) {
      console.log('');
      ghToken = await prompt(rl, `  GitHub personal access token\n  → github.com → Settings → Developer settings → PATs (repo scope)\n  Token: `);
    }

    if (ghToken) {
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${ghToken}`, 'User-Agent': 'software-factory' },
        });
        if (res.ok) {
          const u = await res.json();
          console.log(chalk.green(`  ✔ GitHub: @${u.login}`));
        }
      } catch {}
    }

    if (!renderKey) {
      console.log('');
      renderKey = await prompt(rl, `  Render API key\n  → dashboard.render.com/u/settings → API Keys\n  Key: `);
    }

    if (renderKey) {
      try {
        await fetch('https://api.render.com/v1/owners?limit=1', {
          headers: { Authorization: `Bearer ${renderKey}` },
        });
        console.log(chalk.green('  ✔ Render: connected'));
      } catch {}
    }

    // ── Store secrets in SuperPlane ─────────────────────────────────────────
    console.log(chalk.dim('\n  Storing secrets in SuperPlane…'));
    await upsertSecret(client, 'github-token',      ghToken);
    await upsertSecret(client, 'render-api-key',    renderKey);
    await upsertSecret(client, 'render-service-id', existing.renderServiceId || 'srv-d902b8e8bjmc738r0920');
    console.log(chalk.green('  ✔ Secrets stored'));

    // ── Canvas ──────────────────────────────────────────────────────────────
    process.stdout.write('  Setting up SuperPlane canvas… ');
    const canvasId = await getOrCreateCanvas(client, existing.canvasId, existing.targetRepo || 'superplanehq/superplane');
    console.log(chalk.green(`✔ ${canvasId.slice(0, 8)}…`));

    // ── Save config ─────────────────────────────────────────────────────────
    saveConfig({
      superplaneApiKey: spKey,
      githubToken:      ghToken,
      renderKey,
      renderServiceId:  existing.renderServiceId || 'srv-d902b8e8bjmc738r0920',
      canvasId,
      canvasName:       'software-factory',
      canvasTriggerNodeId: 'start',
      canvasTemplateName:  'Build Issue',
      targetRepo:       existing.targetRepo || 'superplanehq/superplane',
    });

    // ── Auto-register MCP ───────────────────────────────────────────────────
    console.log(chalk.dim('\n  Registering MCP server…'));

    // Claude Code
    try {
      execSync('claude mcp add software-factory -- npx software-factory mcp 2>/dev/null || claude mcp add software-factory npx software-factory mcp', { stdio: 'pipe' });
      console.log(chalk.green('  ✔ Claude Code: registered'));
    } catch {
      // Not installed or already registered — both fine
      console.log(chalk.dim('  · Claude Code: run manually if needed → claude mcp add software-factory -- npx software-factory mcp'));
    }

    // ~/.mcp.json for Codex / OpenCode / any MCP agent
    try {
      const mcpPath = join(homedir(), '.mcp.json');
      const mcpConfig = {
        mcpServers: {
          'software-factory': { command: 'npx', args: ['software-factory', 'mcp'] },
        },
      };
      writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
      console.log(chalk.green('  ✔ Codex / OpenCode: ~/.mcp.json written'));
    } catch {
      console.log(chalk.dim('  · ~/.mcp.json: could not write'));
    }

    // ── Done ────────────────────────────────────────────────────────────────
    console.log(chalk.bold.cyan('\n✅ Software Factory is ready!\n'));
    console.log('  Open your AI agent (Claude Code, OpenCode, Codex) and say:\n');
    console.log(chalk.bold.white('  "Use software-factory tools to build and deploy this:'));
    console.log(chalk.cyan('   https://github.com/owner/repo"\n'));
    console.log(chalk.dim('  The agent will read the spec, write the code,'));
    console.log(chalk.dim('  deploy to Render, and open a PR — automatically.\n'));
    console.log(chalk.dim(`  Canvas: https://app.superplane.com/canvases/${canvasId}`));
    console.log(chalk.dim('  Docs:   https://github.com/hongchengw/superplane-render-nyc-hack\n'));

  } finally {
    rl?.close();
  }
}
