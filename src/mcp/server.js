/**
 * Software Factory MCP Server
 *
 * The AI agent (Claude Code, Codex, OpenCode) is already the intelligence.
 * This server provides infrastructure tools: GitHub, Render, SuperPlane.
 *
 * The agent:
 *   1. Calls fetch_github_issue → reads + understands the issue
 *   2. Calls get_repo_structure / read_repo_file → understands the codebase
 *   3. Writes the implementation itself (using its own AI)
 *   4. Calls push_branch → pushes code to GitHub
 *   5. Calls deploy_preview → deploys to Render, returns live URL
 *   6. Calls create_pr → opens PR + comments on the issue
 *
 * Setup in Claude Code:
 *   claude mcp add software-factory -- npx software-factory mcp
 *
 * Setup in claude_desktop_config.json / .mcp.json:
 *   { "mcpServers": { "software-factory": { "command": "npx", "args": ["software-factory", "mcp"] } } }
 */

import { createInterface } from 'readline';
import { loadConfig } from '../config.js';
import { SuperPlaneClient } from '../superplane/client.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function ok(id, result) { send({ jsonrpc: '2.0', id, result }); }
function fail(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

function getConfig() {
  const c = loadConfig();
  return {
    spToken:      c.superplaneApiKey  || process.env.SUPERPLANE_TOKEN,
    githubToken:  c.githubToken       || process.env.GITHUB_TOKEN,
    renderKey:    c.renderKey         || process.env.RENDER_API_KEY,
    renderSvcId:  c.renderServiceId   || process.env.RENDER_SERVICE_ID,
    canvasId:     c.canvasId,
    targetRepo:   c.targetRepo,
    ...c,
  };
}

async function ghRequest(method, path, body, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'software-factory/0.1.4',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function renderRequest(method, path, body, key) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!res.ok) throw new Error(`Render ${res.status}: ${data.message || text.slice(0, 200)}`);
  return data;
}

function fmtMs(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'fetch_github_issue',
    description: 'Fetch a GitHub issue (title, body, labels, state, comments). Use this first to understand what to build.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_url: { type: 'string', description: 'GitHub issue URL (https://github.com/owner/repo/issues/42) or short form owner/repo#42' },
      },
      required: ['issue_url'],
    },
  },
  {
    name: 'get_repo_structure',
    description: 'List files and directories in a GitHub repo (optionally at a specific path and branch). Use to understand the codebase before implementing.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo' },
        path: { type: 'string', description: 'Directory path (default: root "")' },
        branch: { type: 'string', description: 'Branch name (default: default branch)' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'read_repo_file',
    description: 'Read the content of a specific file in a GitHub repo.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo' },
        path: { type: 'string', description: 'File path (e.g. src/components/Canvas.tsx)' },
        branch: { type: 'string', description: 'Branch name (default: default branch)' },
      },
      required: ['repo', 'path'],
    },
  },
  {
    name: 'push_branch',
    description: 'Push one or more files to a new GitHub branch. Use after implementing the solution to push it to GitHub.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo (e.g. superplanehq/superplane)' },
        branch: { type: 'string', description: 'New branch name (e.g. factory/issue-5368)' },
        base_branch: { type: 'string', description: 'Base branch to branch from (default: main)' },
        files: {
          type: 'array',
          description: 'Files to push',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path in the repo' },
              content: { type: 'string', description: 'Full file content' },
            },
            required: ['path', 'content'],
          },
        },
        commit_message: { type: 'string', description: 'Commit message' },
      },
      required: ['repo', 'branch', 'files', 'commit_message'],
    },
  },
  {
    name: 'deploy_preview',
    description: 'Deploy a GitHub branch to Render and return the live preview URL. Waits for the deployment to finish (up to 10 minutes). Returns the URL immediately when live.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo' },
        branch: { type: 'string', description: 'Branch to deploy' },
        service_name: { type: 'string', description: 'Render service name (auto-generated if omitted)' },
        build_command: { type: 'string', description: 'Build command (default: npm install)' },
        start_command: { type: 'string', description: 'Start command (default: npm start)' },
      },
      required: ['repo', 'branch'],
    },
  },
  {
    name: 'get_deploy_status',
    description: 'Check the status of a Render deployment. Returns status and URL when live.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'Render service ID' },
        deploy_id: { type: 'string', description: 'Render deploy ID' },
      },
      required: ['service_id'],
    },
  },
  {
    name: 'create_pr',
    description: 'Create a GitHub pull request and post a comment on the original issue with the preview URL.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo' },
        branch: { type: 'string', description: 'Head branch with the implementation' },
        base: { type: 'string', description: 'Base branch (default: main)' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR description (markdown)' },
        issue_url: { type: 'string', description: 'Original issue URL to comment on with the preview link' },
        preview_url: { type: 'string', description: 'Render preview URL to include in the PR and issue comment' },
      },
      required: ['repo', 'branch', 'title'],
    },
  },
  {
    name: 'get_pipeline_status',
    description: 'Get the current Software Factory pipeline run status (SuperPlane canvas runs).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'trigger_autonomous_pipeline',
    description: 'Trigger the fully autonomous Software Factory pipeline in SuperPlane (no agent code-writing needed — the pipeline uses AI to implement the issue end-to-end). Takes 15–25 minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_url: { type: 'string', description: 'GitHub issue URL' },
        repo: { type: 'string', description: 'Target repo (owner/repo)' },
      },
      required: ['issue_url'],
    },
  },
  {
    name: 'factory_doctor',
    description: 'Check that the Software Factory is correctly configured. Run this first to verify everything is set up.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── Implementations ──────────────────────────────────────────────────────────

function parseIssueUrl(input) {
  const urlMatch = input.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
  if (urlMatch) return { repo: urlMatch[1], number: parseInt(urlMatch[2]), url: input };
  const shortMatch = input.match(/^([^/]+\/[^/]+)#(\d+)$/);
  if (shortMatch) return {
    repo: shortMatch[1],
    number: parseInt(shortMatch[2]),
    url: `https://github.com/${shortMatch[1]}/issues/${shortMatch[2]}`,
  };
  throw new Error(`Invalid issue URL: ${input}. Expected https://github.com/owner/repo/issues/N or owner/repo#N`);
}

async function impl_fetchIssue({ issue_url }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: factory init or set GITHUB_TOKEN');

  const { repo, number, url } = parseIssueUrl(issue_url);
  const issue = await ghRequest('GET', `/repos/${repo}/issues/${number}`, null, githubToken);

  // Also fetch first 5 comments
  let comments = [];
  try {
    const rawComments = await ghRequest('GET', `/repos/${repo}/issues/${number}/comments?per_page=5`, null, githubToken);
    comments = rawComments.map(c => `@${c.user.login}: ${c.body}`);
  } catch {}

  return [
    `Issue #${number}: ${issue.title}`,
    `URL: ${url}`,
    `Repo: ${repo}`,
    `State: ${issue.state}`,
    `Labels: ${issue.labels.map(l => l.name).join(', ') || 'none'}`,
    `Author: @${issue.user.login}`,
    ``,
    `## Description`,
    issue.body || '(no description)',
    comments.length ? `\n## Comments\n${comments.join('\n\n')}` : '',
    ``,
    `Next: Use get_repo_structure to understand the codebase, then implement the changes.`,
  ].join('\n');
}

async function impl_getRepoStructure({ repo, path = '', branch }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: factory init or set GITHUB_TOKEN');

  const ref = branch ? `?ref=${branch}` : '';
  const data = await ghRequest('GET', `/repos/${repo}/contents/${path}${ref}`, null, githubToken);

  const items = Array.isArray(data) ? data : [data];
  const lines = [`${repo}/${path || ''} (${branch || 'default branch'})`, ''];

  for (const item of items) {
    const icon = item.type === 'dir' ? '📁' : '📄';
    lines.push(`${icon} ${item.name}${item.type === 'dir' ? '/' : ''} (${item.size || 0} bytes)`);
  }

  lines.push('', `Total: ${items.length} items`);
  lines.push(`\nTo read a file: read_repo_file(repo="${repo}", path="${path ? path + '/' : ''}filename")`);

  return lines.join('\n');
}

async function impl_readFile({ repo, path, branch }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: factory init or set GITHUB_TOKEN');

  const ref = branch ? `?ref=${branch}` : '';
  const data = await ghRequest('GET', `/repos/${repo}/contents/${path}${ref}`, null, githubToken);

  if (data.encoding === 'base64') {
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return `File: ${repo}/${path}\nSize: ${data.size} bytes\nSHA: ${data.sha}\n\n${content}`;
  }
  return data.content || '(binary file)';
}

async function impl_pushBranch({ repo, branch, base_branch = 'main', files, commit_message }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: factory init or set GITHUB_TOKEN');
  if (!files?.length) throw new Error('files array is required and must not be empty');

  // Get base branch SHA
  const baseRef = await ghRequest('GET', `/repos/${repo}/git/ref/heads/${base_branch}`, null, githubToken);
  const baseSha = baseRef.object.sha;

  // Get base tree SHA
  const baseCommit = await ghRequest('GET', `/repos/${repo}/git/commits/${baseSha}`, null, githubToken);
  const baseTreeSha = baseCommit.tree.sha;

  // Create blobs for each file
  const treeItems = await Promise.all(files.map(async (f) => {
    const blob = await ghRequest('POST', `/repos/${repo}/git/blobs`, {
      content: f.content,
      encoding: 'utf-8',
    }, githubToken);
    return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));

  // Create new tree
  const newTree = await ghRequest('POST', `/repos/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeItems,
  }, githubToken);

  // Create commit
  const newCommit = await ghRequest('POST', `/repos/${repo}/git/commits`, {
    message: commit_message,
    tree: newTree.sha,
    parents: [baseSha],
  }, githubToken);

  // Create branch
  await ghRequest('POST', `/repos/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: newCommit.sha,
  }, githubToken);

  return [
    `✅ Branch pushed successfully`,
    ``,
    `Branch:  ${branch}`,
    `Commit:  ${newCommit.sha.slice(0, 7)}`,
    `Message: ${commit_message}`,
    `Files:   ${files.map(f => f.path).join(', ')}`,
    `URL:     https://github.com/${repo}/tree/${branch}`,
    ``,
    `Next: Call deploy_preview to get a live Render URL.`,
  ].join('\n');
}

async function impl_deployPreview({ repo, branch, service_name, build_command, start_command }) {
  const { renderKey } = getConfig();
  if (!renderKey) throw new Error(
    'Render API key not configured.\n' +
    'Run: factory init  (and enter your Render API key)\n' +
    'Or: export RENDER_API_KEY=rnd_xxx\n' +
    'Get your key at: https://dashboard.render.com/u/settings → API Keys'
  );

  const cfg = getConfig();
  let serviceId = cfg.renderServiceId || process.env.RENDER_SERVICE_ID;
  let serviceUrl;
  const name = service_name || 'software-factory-poc';

  if (!serviceId) {
    // Look up by name
    try {
      const all = await renderRequest('GET', '/services?limit=20', null, renderKey);
      const found = all.find(s => (s.service || s).name === name);
      if (found) serviceId = (found.service || found).id;
    } catch {}
  }

  if (serviceId) {
    // Update branch on existing service
    await renderRequest('PATCH', `/services/${serviceId}`, { branch }, renderKey);
    const svcInfo = await renderRequest('GET', `/services/${serviceId}`, null, renderKey);
    serviceUrl = svcInfo.service?.serviceDetails?.url || svcInfo.serviceDetails?.url;
  } else {
    // Create a new static site (free — no payment card needed)
    const owners = await renderRequest('GET', '/owners?limit=1', null, renderKey);
    const ownerId = owners?.[0]?.owner?.id;
    if (!ownerId) throw new Error('Could not get Render owner ID');

    const svc = await renderRequest('POST', '/services', {
      type: 'static_site',
      name,
      ownerId,
      repo: `https://github.com/${repo}`,
      branch,
      rootDir: 'poc/public',
      serviceDetails: {
        buildCommand: build_command || '',
        publishPath: '.',
      },
    }, renderKey);

    serviceId = svc.service?.id || svc.id;
    serviceUrl = svc.service?.serviceDetails?.url || svc.serviceDetails?.url;

    // Persist so future calls skip creation
    const { loadConfig: lc, saveConfig: sc } = await import('../config.js');
    const existing = lc();
    sc({ ...existing, renderServiceId: serviceId });
  }

  if (!serviceId) throw new Error('Failed to get Render service ID');

  // Trigger the deploy
  const deploy = await renderRequest('POST', `/services/${serviceId}/deploys`, {
    clearCache: 'do_not_clear',
  }, renderKey);
  const deployId = deploy.deploy?.id || deploy.id;

  process.stderr.write(`[factory] Deploy triggered (${serviceId} / ${deployId})...\n`);
  const started = Date.now();

  // Poll — static sites are live in ~20s, web services ~2–3 min
  for (let i = 0; i < 72; i++) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const status = await renderRequest('GET', `/services/${serviceId}/deploys/${deployId}`, null, renderKey);
      const s = status.deploy?.status || status.status;
      process.stderr.write(`[factory] ${s} (${fmtMs(Date.now() - started)})\n`);

      if (s === 'live') {
        const svcInfo = await renderRequest('GET', `/services/${serviceId}`, null, renderKey);
        const url = svcInfo.service?.serviceDetails?.url || svcInfo.serviceDetails?.url || serviceUrl;
        return [
          `✅ Live on Render!`,
          ``,
          `🚀 Preview URL: ${url}`,
          `Service:        ${serviceId}`,
          `Deploy:         ${deployId}`,
          `Time:           ${fmtMs(Date.now() - started)}`,
          ``,
          `Next: Call create_pr to open a pull request with this preview URL.`,
        ].join('\n');
      }
      if (s === 'failed' || s === 'canceled') {
        throw new Error(`Render deploy ${s} after ${fmtMs(Date.now() - started)}`);
      }
    } catch (e) {
      if (e.message.includes('failed') || e.message.includes('canceled')) throw e;
    }
  }

  throw new Error(`Deploy timed out after ~10 minutes. Check: https://dashboard.render.com`);
}

async function impl_getDeployStatus({ service_id, deploy_id }) {
  const { renderKey } = getConfig();
  if (!renderKey) throw new Error('Render API key not configured. Run: factory init or set RENDER_API_KEY');

  const svc = await renderRequest('GET', `/services/${service_id}`, null, renderKey);
  const url = svc.service?.serviceDetails?.url || svc.serviceDetails?.url;

  if (deploy_id) {
    const d = await renderRequest('GET', `/services/${service_id}/deploys/${deploy_id}`, null, renderKey);
    const s = d.deploy?.status || d.status;
    return `Deploy ${deploy_id}: ${s}\nService URL: ${url || 'pending'}`;
  }

  // Latest deploy
  const deploys = await renderRequest('GET', `/services/${service_id}/deploys?limit=1`, null, renderKey);
  const latest = deploys?.[0]?.deploy || deploys?.[0];
  return [
    `Service: ${service_id}`,
    `URL:     ${url || 'pending'}`,
    latest ? `Latest deploy: ${latest.id} — ${latest.status}` : 'No deploys yet',
  ].join('\n');
}

async function impl_createPR({ repo, branch, base = 'main', title, body = '', issue_url, preview_url }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: factory init or set GITHUB_TOKEN');

  const prBody = [
    body,
    preview_url ? `\n**🚀 Preview:** ${preview_url}` : '',
    issue_url ? `\n**Issue:** ${issue_url}` : '',
    `\n---\n*Built with [Software Factory](https://www.npmjs.com/package/software-factory) · Orchestrated by [SuperPlane](https://superplane.com) · Deployed on [Render](https://render.com)*`,
  ].filter(Boolean).join('\n');

  const pr = await ghRequest('POST', `/repos/${repo}/pulls`, {
    title,
    head: branch,
    base,
    body: prBody,
  }, githubToken);

  const prUrl = pr.html_url;

  // Comment on the original issue if provided
  if (issue_url) {
    try {
      const { repo: issueRepo, number } = parseIssueUrl(issue_url);
      const comment = [
        `### 🏭 Software Factory built a PoC for this issue!`,
        ``,
        preview_url ? `**🚀 Live Preview:** ${preview_url}` : '',
        `**🔀 Pull Request:** ${prUrl}`,
        ``,
        `| Stage | Status |`,
        `|-------|--------|`,
        `| Fetch Issue | ✅ Done |`,
        `| Implementation | ✅ Done |`,
        preview_url ? `| Deploy to Render | ✅ Live |` : `| Deploy | ⏳ Pending |`,
        `| Pull Request | ✅ Open |`,
        ``,
        `*Built with [Software Factory](https://www.npmjs.com/package/software-factory)*`,
      ].filter(Boolean).join('\n');

      await ghRequest('POST', `/repos/${issueRepo}/issues/${number}/comments`, { body: comment }, githubToken);
    } catch {}
  }

  return [
    `✅ Pull Request created!`,
    ``,
    `PR URL:      ${prUrl}`,
    `PR Number:   #${pr.number}`,
    preview_url ? `Preview URL: ${preview_url}` : '',
    ``,
    `The PR is now open. A comment with the preview link has been posted to the original issue.`,
  ].filter(Boolean).join('\n');
}

async function impl_pipelineStatus() {
  const cfg = getConfig();
  if (!cfg.spToken || !cfg.canvasId) return 'Not configured. Run: factory init';

  const client = new SuperPlaneClient(cfg.spToken);
  const { runs } = await client.listRuns(cfg.canvasId);
  if (!runs?.length) return 'No pipeline runs yet. Use trigger_autonomous_pipeline or factory build.';

  const STAGES = ['start','fetch-issue','requirement-agent','implementation-agent','validation-agent','render-deploy','pr-agent','create-pr','pr-comment'];
  const lines = [];

  for (const [i, run] of runs.slice(0, 3).entries()) {
    const execs = run.executions || [];
    const byNode = {};
    for (const e of execs) byNode[e.nodeId] = e;

    const dur = run.finishedAt
      ? fmtMs(new Date(run.finishedAt) - new Date(run.createdAt))
      : fmtMs(Date.now() - new Date(run.createdAt)) + ' (running)';

    lines.push(`[${i}] Run ${run.id.slice(0,8)}…  ${run.state} / ${run.result || 'in-progress'}  (${dur})`);
    for (const nodeId of STAGES) {
      const ex = byNode[nodeId];
      if (!ex) continue;
      const icon = ex.result === 'RESULT_PASSED' ? '✅' : ex.result === 'RESULT_FAILED' ? '❌' : '⟳';
      lines.push(`  ${icon} ${nodeId}`);
    }
    if (i < 2) lines.push('');
  }

  lines.push(`\nCanvas: https://app.superplane.com/canvases/${cfg.canvasId}`);
  return lines.join('\n');
}

async function impl_triggerAutonomous({ issue_url, repo }) {
  const cfg = getConfig();
  if (!cfg.spToken || !cfg.canvasId) throw new Error('Not configured. Run: factory init');

  const { repo: parsedRepo, number, url } = parseIssueUrl(issue_url);
  const targetRepo = repo || cfg.targetRepo || parsedRepo;

  const client = new SuperPlaneClient(cfg.spToken);
  const result = await client.triggerCanvas(
    cfg.canvasId,
    cfg.canvasTriggerNodeId || 'start',
    { issue_url: url, repo: targetRepo },
    cfg.canvasTemplateName || 'Build Issue',
  );

  return [
    `✅ Autonomous pipeline triggered!`,
    ``,
    `Issue: ${url}`,
    `Repo:  ${targetRepo}`,
    `Event: ${result.result?.event_id || 'pending'}`,
    ``,
    `The pipeline will autonomously implement and deploy this issue (15–25 min).`,
    `Monitor with: get_pipeline_status tool`,
    `Canvas: https://app.superplane.com/canvases/${cfg.canvasId}`,
    ``,
    `Note: Autonomous mode requires an Anthropic API key stored in SuperPlane secrets.`,
    `For agent-first mode (faster, no Anthropic key): use fetch_github_issue → push_branch → deploy_preview → create_pr`,
  ].join('\n');
}

async function impl_doctor() {
  const cfg = getConfig();
  const lines = ['Software Factory Configuration Check', ''];

  // SuperPlane
  if (cfg.spToken) {
    try {
      const client = new SuperPlaneClient(cfg.spToken);
      const me = await client.getMe();
      lines.push(`✅ SuperPlane API     Connected as ${me.user?.name || me.user?.id}`);
      if (cfg.canvasId) {
        try {
          const { canvas } = await client.getCanvas(cfg.canvasId);
          lines.push(`✅ Factory Canvas     "${canvas.metadata?.name}" (${cfg.canvasId.slice(0,8)}…)`);
        } catch { lines.push(`❌ Factory Canvas     Not found — run: factory init`); }
      } else {
        lines.push(`❌ Factory Canvas     Not set — run: factory init`);
      }
    } catch (e) { lines.push(`❌ SuperPlane API     ${e.message}`); }
  } else {
    lines.push(`❌ SuperPlane API     No token — run: factory init or set SUPERPLANE_TOKEN`);
  }

  // GitHub
  if (cfg.githubToken) {
    try {
      const user = await ghRequest('GET', '/user', null, cfg.githubToken);
      lines.push(`✅ GitHub Token       @${user.login} (${user.name || ''})`);
    } catch (e) { lines.push(`❌ GitHub Token       ${e.message}`); }
  } else {
    lines.push(`❌ GitHub Token       Not set — run: factory init or set GITHUB_TOKEN`);
  }

  // Render
  if (cfg.renderKey) {
    try {
      await renderRequest('GET', '/owners?limit=1', null, cfg.renderKey);
      lines.push(`✅ Render API Key     Connected`);
    } catch (e) { lines.push(`❌ Render API Key     ${e.message}`); }
  } else {
    lines.push(`⚠️  Render API Key     Not set (required for deploy_preview)`);
    lines.push(`     Get it: https://dashboard.render.com/u/settings → API Keys`);
    lines.push(`     Then run: factory init`);
  }

  const allGood = !lines.some(l => l.startsWith('❌'));
  lines.push('');
  lines.push(allGood
    ? '✅ All checks passed.\n\nAgent workflow: fetch_github_issue → implement → push_branch → deploy_preview → create_pr'
    : '⚠️  Complete setup: factory init\n   Required: SuperPlane token, GitHub token, Render API key');

  return lines.join('\n');
}

// ── Request router ────────────────────────────────────────────────────────────

async function handle(req) {
  const { id, method, params } = req;

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'software-factory', version: '0.1.5' },
      capabilities: { tools: {} },
    });
  }

  if (method === 'tools/list') return ok(id, { tools: TOOLS });

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    try {
      let text;
      switch (name) {
        case 'fetch_github_issue':           text = await impl_fetchIssue(args); break;
        case 'get_repo_structure':           text = await impl_getRepoStructure(args); break;
        case 'read_repo_file':               text = await impl_readFile(args); break;
        case 'push_branch':                  text = await impl_pushBranch(args); break;
        case 'deploy_preview':               text = await impl_deployPreview(args); break;
        case 'get_deploy_status':            text = await impl_getDeployStatus(args); break;
        case 'create_pr':                    text = await impl_createPR(args); break;
        case 'get_pipeline_status':          text = await impl_pipelineStatus(); break;
        case 'trigger_autonomous_pipeline':  text = await impl_triggerAutonomous(args); break;
        case 'factory_doctor':               text = await impl_doctor(); break;
        default: return fail(id, -32601, `Unknown tool: ${name}`);
      }
      return ok(id, { content: [{ type: 'text', text }] });
    } catch (e) {
      return ok(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
    }
  }

  if (method === 'notifications/initialized') return;
  return fail(id, -32601, `Method not found: ${method}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function startMcpServer() {
  process.stderr.write('[software-factory MCP] Ready. Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', async line => {
    if (!line.trim()) return;
    let req;
    try { req = JSON.parse(line); }
    catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    await handle(req);
  });
  rl.on('close', () => process.exit(0));
}
