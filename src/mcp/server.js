/**
 * Software Factory MCP Server
 *
 * Exposes factory commands as MCP tools so any AI coding agent
 * (Claude Code, Codex, OpenCode, etc.) can trigger and monitor pipelines.
 *
 * Usage: factory mcp  (registered as an MCP server in agent config)
 *
 * Claude Code config (~/.claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "software-factory": {
 *       "command": "npx",
 *       "args": ["software-factory", "mcp"]
 *     }
 *   }
 * }
 */

import { createInterface } from 'readline';
import { SuperPlaneClient } from '../superplane/client.js';
import { loadConfig } from '../config.js';

// ── Protocol helpers ──────────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function err(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'build_issue',
    description:
      'Trigger the Software Factory pipeline for a GitHub issue. ' +
      'The pipeline autonomously: fetches the issue, generates a spec with Claude, ' +
      'writes code, runs tests, deploys to Render, and opens a PR with the preview URL.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_url: {
          type: 'string',
          description: 'GitHub issue URL (e.g. https://github.com/owner/repo/issues/42) or short form owner/repo#42',
        },
        repo: {
          type: 'string',
          description: 'Override target repository (owner/repo). Defaults to the configured target repo.',
        },
      },
      required: ['issue_url'],
    },
  },
  {
    name: 'get_status',
    description:
      'Get the current pipeline run status. Returns the state of each stage, ' +
      'elapsed time, and the preview URL + PR URL when the run completes.',
    inputSchema: {
      type: 'object',
      properties: {
        run_index: {
          type: 'number',
          description: 'Index of the run to inspect (0 = latest). Default: 0.',
        },
      },
    },
  },
  {
    name: 'list_runs',
    description: 'List recent pipeline runs with their state and result.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_logs',
    description: 'Get the execution log output for a specific pipeline stage.',
    inputSchema: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description: 'Stage name: fetch-issue | requirement-agent | implementation-agent | validation-agent | render-deploy | pr-agent',
          enum: ['fetch-issue', 'requirement-agent', 'implementation-agent', 'validation-agent', 'render-deploy', 'pr-agent'],
        },
      },
      required: ['stage'],
    },
  },
  {
    name: 'doctor',
    description: 'Check that the Software Factory is correctly configured (API keys, canvas, secrets).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────

function getClient() {
  const config = loadConfig();
  const token = config.superplaneApiKey || process.env.SUPERPLANE_TOKEN;
  if (!token) throw new Error('Not configured. Run: factory init');
  return { client: new SuperPlaneClient(token), config };
}

function parseIssueUrl(input) {
  const urlMatch = input.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
  if (urlMatch) return { repo: urlMatch[1], issueNumber: parseInt(urlMatch[2]), url: input };
  const shortMatch = input.match(/^([^/]+\/[^/]+)#(\d+)$/);
  if (shortMatch) return {
    repo: shortMatch[1],
    issueNumber: parseInt(shortMatch[2]),
    url: `https://github.com/${shortMatch[1]}/issues/${shortMatch[2]}`,
  };
  return null;
}

function fmtDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

const STAGE_ORDER = [
  'start', 'fetch-issue', 'requirement-agent', 'implementation-agent',
  'validation-agent', 'render-deploy', 'pr-agent', 'create-pr', 'pr-comment',
];

async function toolBuildIssue({ issue_url, repo }) {
  const { client, config } = getClient();
  if (!config.canvasId) throw new Error('No canvas configured. Run: factory init');

  const parsed = parseIssueUrl(issue_url);
  if (!parsed) throw new Error(`Invalid issue URL: ${issue_url}`);

  const targetRepo = repo || config.targetRepo || parsed.repo;

  const result = await client.triggerCanvas(
    config.canvasId,
    config.canvasTriggerNodeId || 'start',
    { issue_url: parsed.url, repo: targetRepo },
    config.canvasTemplateName || 'Build Issue',
  );

  const eventId = result.result?.event_id;

  return [
    `✅ Pipeline triggered for issue #${parsed.issueNumber}`,
    ``,
    `Issue:   ${parsed.url}`,
    `Repo:    ${targetRepo}`,
    `Canvas:  ${config.canvasId}`,
    eventId ? `Event:   ${eventId}` : '',
    ``,
    `The pipeline is now running through 6 stages in SuperPlane:`,
    `  1. Fetch Issue           → reads GitHub issue details`,
    `  2. Requirement Agent     → Claude writes an implementation spec`,
    `  3. Implementation Agent  → Claude writes code, pushes branch`,
    `  4. Validation Agent      → runs npm test / build / lint`,
    `  5. Deploy to Render      → deploys preview environment`,
    `  6. PR Agent              → opens PR + comments preview URL on issue`,
    ``,
    `Monitor with: get_status tool  |  factory status --watch`,
    `Canvas URL: https://app.superplane.com/canvases/${config.canvasId}`,
  ].filter(l => l !== null).join('\n');
}

async function toolGetStatus({ run_index = 0 } = {}) {
  const { client, config } = getClient();
  if (!config.canvasId) throw new Error('No canvas configured. Run: factory init');

  const { runs } = await client.listRuns(config.canvasId);
  if (!runs?.length) return 'No runs yet. Use build_issue to start the pipeline.';

  const run = runs[run_index] || runs[0];
  const execs = run.executions || [];
  const byNode = {};
  for (const ex of execs) byNode[ex.nodeId] = ex;

  const lines = [
    `Run ID:  ${run.id}`,
    `State:   ${run.state}`,
    `Result:  ${run.result || 'in progress'}`,
    `Started: ${new Date(run.createdAt).toLocaleString()}`,
    run.finishedAt ? `Done:    ${new Date(run.finishedAt).toLocaleString()} (${fmtDuration(new Date(run.finishedAt) - new Date(run.createdAt))})` : '',
    '',
    'Stages:',
  ];

  for (const nodeId of STAGE_ORDER) {
    const ex = byNode[nodeId];
    if (!ex) continue;
    const label = nodeId.padEnd(26);
    let status = ex.state === 'STATE_FINISHED'
      ? (ex.result === 'RESULT_PASSED' ? '✅ passed' : `❌ ${ex.result}`)
      : '⟳ running';
    const dur = ex.createdAt && ex.updatedAt
      ? ` (${fmtDuration(new Date(ex.updatedAt) - new Date(ex.createdAt))})`
      : '';
    lines.push(`  ${label} ${status}${dur}`);
    if (ex.result === 'RESULT_FAILED' && ex.resultMessage) {
      lines.push(`    ↳ ${ex.resultMessage}`);
    }
  }

  // Extract URLs
  const renderEx = byNode['render-deploy'];
  const prEx = byNode['pr-agent'] || byNode['create-pr'];
  if (renderEx?.resultData?.preview_url) {
    lines.push('', `🚀 Preview URL: ${renderEx.resultData.preview_url}`);
  }
  if (prEx?.resultData?.pr_url || prEx?.resultData?.html_url) {
    lines.push(`🔀 PR URL:      ${prEx.resultData?.pr_url || prEx.resultData?.html_url}`);
  }

  lines.push('', `Canvas: https://app.superplane.com/canvases/${config.canvasId}`);

  return lines.filter(l => l !== null).join('\n');
}

async function toolListRuns() {
  const { client, config } = getClient();
  if (!config.canvasId) throw new Error('No canvas configured. Run: factory init');

  const { runs, totalCount } = await client.listRuns(config.canvasId);
  if (!runs?.length) return 'No runs yet. Use build_issue to start the pipeline.';

  const lines = [`${totalCount || runs.length} run(s) on canvas ${config.canvasId}`, ''];
  for (const [i, run] of runs.entries()) {
    const dur = run.finishedAt
      ? ` · ${fmtDuration(new Date(run.finishedAt) - new Date(run.createdAt))}`
      : '';
    lines.push(`[${i}] ${run.id.slice(0, 8)}... ${run.state} ${run.result || ''}${dur}`);
    lines.push(`     ${new Date(run.createdAt).toLocaleString()}`);
  }
  return lines.join('\n');
}

async function toolGetLogs({ stage }) {
  const { client, config } = getClient();
  if (!config.canvasId) throw new Error('No canvas configured. Run: factory init');

  const { executions } = await client.listNodeExecutions(config.canvasId, stage);
  if (!executions?.length) return `No executions found for stage: ${stage}`;

  const latest = executions[0];
  const lines = [
    `Stage: ${stage}`,
    `State: ${latest.state}  Result: ${latest.result}`,
    latest.resultMessage ? `Message: ${latest.resultMessage}` : '',
    '',
    'Output:',
    latest.output || latest.logs || '(no output captured)',
  ];
  return lines.filter(l => l !== null).join('\n');
}

async function toolDoctor() {
  const config = loadConfig();
  const token = config.superplaneApiKey || process.env.SUPERPLANE_TOKEN;
  const lines = [];

  // SuperPlane
  if (token) {
    try {
      const client = new SuperPlaneClient(token);
      const me = await client.getMe();
      lines.push(`✅ SuperPlane API     Connected as ${me.user?.name || me.user?.id}`);

      if (config.canvasId) {
        try {
          const { canvas } = await client.getCanvas(config.canvasId);
          lines.push(`✅ Factory Canvas     "${canvas.metadata?.name}" (${config.canvasId.slice(0, 8)}...)`);
        } catch {
          lines.push(`❌ Factory Canvas     Not found — run: factory init`);
        }
      } else {
        lines.push(`❌ Factory Canvas     Not configured — run: factory init`);
      }

      const exists_anthropic = await client.secretExists('anthropic-api-key');
      const exists_github = await client.secretExists('github-token');
      const exists_render = await client.secretExists('render-api-key');
      lines.push(`${exists_anthropic ? '✅' : '❌'} Secret: anthropic-api-key`);
      lines.push(`${exists_github ? '✅' : '❌'} Secret: github-token`);
      lines.push(`${exists_render ? '✅' : '⚠️'} Secret: render-api-key (optional)`);
    } catch (e) {
      lines.push(`❌ SuperPlane API     ${e.message}`);
    }
  } else {
    lines.push(`❌ SuperPlane API     No token — run: factory init`);
  }

  if (config.targetRepo) lines.push(``, `Target repo: ${config.targetRepo}`);
  if (config.canvasId) lines.push(`Canvas URL:  https://app.superplane.com/canvases/${config.canvasId}`);

  const allGood = lines.every(l => !l.startsWith('❌'));
  lines.push('', allGood
    ? '✅ All checks passed. Ready to build: build_issue tool'
    : '⚠️  Some checks failed. Run: factory init to reconfigure.');

  return lines.join('\n');
}

// ── Request handler ──────────────────────────────────────────────────────────

async function handleRequest(req) {
  const { id, method, params } = req;

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'software-factory', version: '0.1.3' },
      capabilities: { tools: {} },
    });
  }

  if (method === 'tools/list') {
    return ok(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    try {
      let text;
      switch (name) {
        case 'build_issue':    text = await toolBuildIssue(args); break;
        case 'get_status':     text = await toolGetStatus(args); break;
        case 'list_runs':      text = await toolListRuns(); break;
        case 'get_logs':       text = await toolGetLogs(args); break;
        case 'doctor':         text = await toolDoctor(); break;
        default:
          return err(id, -32601, `Unknown tool: ${name}`);
      }
      return ok(id, { content: [{ type: 'text', text }] });
    } catch (e) {
      return ok(id, {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      });
    }
  }

  if (method === 'notifications/initialized') return; // no response needed

  return err(id, -32601, `Method not found: ${method}`);
}

// ── Stdio transport ──────────────────────────────────────────────────────────

export function startMcpServer() {
  process.stderr.write('[software-factory MCP server] Ready\n');

  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    await handleRequest(req);
  });

  rl.on('close', () => process.exit(0));
}
