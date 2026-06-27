import chalk from 'chalk';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
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
  // Try to find the existing canvas named 'software-factory'
  let existingId = canvasId;
  try {
    const { canvases } = await client.listCanvases();
    const found = (canvases || []).find(c => c.name === 'software-factory' || c.metadata?.name === 'software-factory');
    if (found) {
      existingId = found.id || found.metadata?.id;
    }
  } catch {}

  // If it exists, delete it first to ensure we refresh the spec/nodes/edges
  if (existingId) {
    try {
      await client.delete(`/canvases/${existingId}`);
    } catch {}
  }

  // Create a new canvas with the latest spec
  const spec = buildCanvasSpec({ targetRepo });
  const { canvas } = await client.createCanvas('software-factory', spec);
  return canvas.id || canvas.metadata?.id;
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

    // ── Auto-register MCP in every known agent ──────────────────────────────
    console.log(chalk.dim('\n  Registering MCP server in AI agents…'));

    // 1. Claude Code
    try {
      execSync('claude mcp add software-factory -- npx software-factory mcp', { stdio: 'pipe' });
      console.log(chalk.green('  ✔ Claude Code'));
    } catch {
      console.log(chalk.dim('  · Claude Code: not found (run manually: claude mcp add software-factory -- npx software-factory mcp)'));
    }

    // 2. OpenCode — ~/opencode.json (global config, format: { mcp: { name: { type, command } } })
    try {
      const ocPath = join(homedir(), 'opencode.json');
      let ocConfig = {};
      try { ocConfig = JSON.parse(readFileSync(ocPath, 'utf8')); } catch {}
      ocConfig.mcp = ocConfig.mcp || {};
      ocConfig.mcp['software-factory'] = { type: 'local', command: ['npx', 'software-factory', 'mcp'] };
      if (!ocConfig['$schema']) ocConfig = { '$schema': 'https://opencode.ai/config.json', ...ocConfig };
      writeFileSync(ocPath, JSON.stringify(ocConfig, null, 2) + '\n');
      console.log(chalk.green('  ✔ OpenCode (~/opencode.json)'));
    } catch {
      console.log(chalk.dim('  · OpenCode: could not write ~/opencode.json'));
    }

    // 3. ~/.mcp.json — standard format for Codex, Cursor, and other MCP-compatible agents
    try {
      const mcpPath = join(homedir(), '.mcp.json');
      let mcpConfig = {};
      try { mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8')); } catch {}
      mcpConfig.mcpServers = mcpConfig.mcpServers || {};
      mcpConfig.mcpServers['software-factory'] = { command: 'npx', args: ['software-factory', 'mcp'] };
      writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
      console.log(chalk.green('  ✔ Codex / Cursor (~/.mcp.json)'));
    } catch {
      console.log(chalk.dim('  · ~/.mcp.json: could not write'));
    }

    // ── Done ────────────────────────────────────────────────────────────────
    console.log(chalk.bold.cyan('\n✅ Software Factory is ready!\n'));
    console.log(chalk.bold('  ─── Now open OpenCode (or Claude Code / Codex) ───\n'));
    console.log('  Paste this prompt with your GitHub URL:\n');
    console.log(chalk.bgBlue.white.bold(
      '  Use software-factory tools to build and deploy this:  '
    ));
    console.log(chalk.cyan.bold('  https://github.com/your-username/your-repo\n'));
    console.log(chalk.dim('  The repo needs a SPEC.md, spec.md, PROMPT.md, or README.md'));
    console.log(chalk.dim('  describing what to build. The agent will:'));
    console.log(chalk.dim('    1. Read the spec from GitHub'));
    console.log(chalk.dim('    2. Explore and understand the codebase'));
    console.log(chalk.dim('    3. Write the code + tests'));
    console.log(chalk.dim('    4. Push a new branch to GitHub'));
    console.log(chalk.dim('    5. Deploy live to Render (~20s)'));
    console.log(chalk.dim('    6. Open a PR with the live URL\n'));
    console.log(chalk.dim(`  Canvas: https://app.superplane.com/canvases/${canvasId}`));
    console.log(chalk.dim('  Docs:   https://github.com/hongchengw/superplane-render-nyc-hack\n'));

  } finally {
    rl?.close();
  }
}
