import { createInterface } from 'readline';
import { loadConfig, saveConfig } from '../config.js';
import { SuperPlaneClient } from '../superplane/client.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function ok(id, result) { send({ jsonrpc: '2.0', id, result }); }
function fail(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

function getConfig() {
  const c = loadConfig();
  return {
    spToken:     c.superplaneApiKey || process.env.SUPERPLANE_TOKEN,
    githubToken: c.githubToken      || process.env.GITHUB_TOKEN,
    renderKey:   c.renderKey        || process.env.RENDER_API_KEY,
    renderSvcId: c.renderServiceId  || process.env.RENDER_SERVICE_ID,
    canvasId:    c.canvasId,
    targetRepo:  c.targetRepo,
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
      'User-Agent': 'software-factory/0.2.1',
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

function renderServiceName(repo) {
  const slug = (repo || '').split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32) || 'poc';
  return `factory-${slug}`;
}

/**
 * Auto-trigger the SuperPlane pipeline for a given issue URL.
 * This ensures every workflow is visible in the SuperPlane cloud canvas.
 * Returns a status message to embed in tool output, or null if not configured.
 */
async function autoTriggerPipeline(issueUrl, repo) {
  const cfg = getConfig();
  if (!cfg.spToken || !cfg.canvasId) return null;
  try {
    const client = new SuperPlaneClient(cfg.spToken);
    const targetRepo = repo || cfg.targetRepo;
    await client.triggerCanvas(
      cfg.canvasId,
      cfg.canvasTriggerNodeId || 'start',
      { issue_url: issueUrl, repo: targetRepo },
      cfg.canvasTemplateName || 'Build Issue',
    );
    return [
      ``,
      `---`,
      `## 🚀 SuperPlane Pipeline Auto-Triggered`,
      ``,
      `The full autonomous pipeline is now running end-to-end on SuperPlane.`,
      `Every stage is live and visible in the SuperPlane cloud canvas:`,
      ``,
      `  🌐 Canvas: https://app.superplane.com/canvases/${cfg.canvasId}`,
      ``,
      `Pipeline stages (all running in SuperPlane cloud):`,
      `  1. fetch-issue          → reads issue from GitHub`,
      `  2. requirement-agent    → Claude writes implementation spec with Mermaid diagram`,
      `  3. implementation-agent → Claude writes code and pushes branch`,
      `  4. validation-agent     → runs npm test / lint / build`,
      `  5. render-deploy        → deploys poc/public/ to Render (~20s)`,
      `  6. pr-agent             → opens PR + posts preview URL on issue`,
      ``,
      `📊 Monitor progress: call \`get_pipeline_status\` every 10-15 seconds until STATE_FINISHED.`,
      `   When finished, extract 🚀 Preview URL and 🔀 PR URL from the status output.`,
      ``,
      `⚠️  The pipeline is handling the full implementation autonomously.`,
      `   You do NOT need to call push_branch, deploy_preview, or create_pr manually.`,
      `   Just poll get_pipeline_status until complete, then report the URLs to the user.`,
    ].join('\n');
  } catch (e) {
    process.stderr.write(`[factory] auto-trigger failed (non-fatal): ${e.message}\n`);
    return null;
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'factory_doctor',
    description: 'Check that the Software Factory is correctly configured. Run this first to verify SuperPlane, GitHub, and Render are all connected.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fetch_github_spec',
    description: [
      'Fetch the build specification from a GitHub URL. Accepts:',
      '  • A repo URL (https://github.com/owner/repo) → reads SPEC.md, spec.md, PROMPT.md, or README.md',
      '  • A specific file URL (https://github.com/owner/repo/blob/main/SPEC.md) → reads that file',
      '  • An issue URL (https://github.com/owner/repo/issues/42) → reads the issue title + body',
      '',
      'IMPORTANT: When called with an issue URL and SuperPlane is configured, this tool automatically',
      'triggers the full autonomous pipeline in SuperPlane so the entire workflow is visible in the',
      'SuperPlane cloud canvas. After calling this, you should call get_pipeline_status to monitor.',
      '',
      'Returns: the full spec text, repo metadata, and SuperPlane pipeline status if auto-triggered.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'GitHub repo URL, file URL, or issue URL' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_repo_structure',
    description: 'List files and directories in a GitHub repo (optionally at a specific path/branch). Use to explore the codebase before writing code.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo' },
        path: { type: 'string', description: 'Directory path (default: root)' },
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
    description: [
      'Push one or more files to a new GitHub branch. Use after implementing the solution.',
      'IMPORTANT: Always include poc/public/index.html — a static HTML demo page showing what was built.',
      'The demo page is what gets deployed to Render as a live preview.',
      '',
      'NOTE: If fetch_github_spec already triggered the SuperPlane autonomous pipeline,',
      'you should NOT call this manually — the pipeline handles push, deploy, and PR automatically.',
      'Only call this if you are doing a fully manual implementation workflow.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo — the TARGET repo to push implementation to' },
        branch: { type: 'string', description: 'New branch name (e.g. factory/issue-5368 or factory/my-feature)' },
        base_branch: { type: 'string', description: 'Base branch (default: main)' },
        files: {
          type: 'array',
          description: 'Files to push. Always include poc/public/index.html for the demo page.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string', description: 'Full file content' },
            },
            required: ['path', 'content'],
          },
        },
        commit_message: { type: 'string' },
      },
      required: ['repo', 'branch', 'files', 'commit_message'],
    },
  },
  {
    name: 'deploy_preview',
    description: [
      'Deploy a GitHub branch to Render and return the live HTTPS preview URL.',
      'Creates a new Render static site named factory-{reponame} the first time.',
      'On repeat calls for the same repo, updates the existing service (fast redeploy ~20s).',
      'The deployed files come from the poc/public/ directory in the branch.',
      'Call this AFTER push_branch.',
      '',
      'NOTE: If fetch_github_spec already triggered the SuperPlane autonomous pipeline,',
      'you should NOT call this manually — the pipeline handles deployment automatically.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo — the repo containing the branch' },
        branch: { type: 'string', description: 'Branch to deploy' },
        root_dir: { type: 'string', description: 'Directory in the repo to serve (default: poc/public)' },
        service_name: { type: 'string', description: 'Override Render service name (default: factory-{reponame})' },
      },
      required: ['repo', 'branch'],
    },
  },
  {
    name: 'get_deploy_status',
    description: 'Check the current status of a Render deployment.',
    inputSchema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'Render service ID' },
        deploy_id: { type: 'string', description: 'Render deploy ID (optional — shows latest if omitted)' },
      },
      required: ['service_id'],
    },
  },
  {
    name: 'create_pr',
    description: [
      'Open a GitHub pull request and post a comment on the original issue with the preview URL.',
      'Call this AFTER deploy_preview.',
      '',
      'NOTE: If fetch_github_spec already triggered the SuperPlane autonomous pipeline,',
      'you should NOT call this manually — the pipeline opens the PR automatically.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo' },
        branch: { type: 'string', description: 'Branch with the implementation' },
        base: { type: 'string', description: 'Base branch (default: main)' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR description (markdown)' },
        issue_url: { type: 'string', description: 'Original issue URL — will receive a comment with the preview link' },
        preview_url: { type: 'string', description: 'Live Render URL to include in PR and issue comment' },
      },
      required: ['repo', 'branch', 'title'],
    },
  },
  {
    name: 'get_pipeline_status',
    description: [
      'Get the current SuperPlane pipeline run status and progress.',
      'Poll this every 10-15 seconds after triggering a pipeline until STATE_FINISHED.',
      'Returns live stage-by-stage progress visible in the SuperPlane cloud canvas,',
      'plus the 🚀 Preview URL and 🔀 PR URL when the pipeline finishes.',
      '',
      'This is the PRIMARY monitoring tool — use it after fetch_github_spec or',
      'trigger_autonomous_pipeline to watch the full workflow in real time.',
    ].join('\n'),
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'trigger_autonomous_pipeline',
    description: [
      'Trigger the fully autonomous Software Factory pipeline on SuperPlane.',
      'SuperPlane runs everything end-to-end: spec → code → deploy → PR.',
      'The entire workflow is visible live in the SuperPlane cloud canvas.',
      'Takes 5–15 minutes. Requires Anthropic API key stored in SuperPlane secrets.',
      '',
      'Use this as the PRIMARY workflow. After triggering, poll get_pipeline_status',
      'every 10-15 seconds until the run is STATE_FINISHED, then report the URLs.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        issue_url: { type: 'string', description: 'GitHub issue URL or repo URL with a spec file' },
        repo: { type: 'string', description: 'Target repo (owner/repo) to push implementation to' },
      },
      required: ['issue_url'],
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
  throw new Error(`Invalid issue URL: ${input}`);
}

function parseGitHubUrl(url) {
  // https://github.com/owner/repo
  const repoMatch = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/?$/);
  if (repoMatch) return { type: 'repo', repo: repoMatch[1] };

  // https://github.com/owner/repo/blob/branch/path/to/file.md
  const fileMatch = url.match(/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)/);
  if (fileMatch) return { type: 'file', repo: fileMatch[1], branch: fileMatch[2], path: fileMatch[3] };

  // https://github.com/owner/repo/issues/N
  const issueMatch = url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
  if (issueMatch) return { type: 'issue', repo: issueMatch[1], number: parseInt(issueMatch[2]) };

  // owner/repo
  const shortRepo = url.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/);
  if (shortRepo) return { type: 'repo', repo: shortRepo[1] };

  throw new Error(`Could not parse GitHub URL: ${url}`);
}

async function impl_fetchSpec({ url }) {
  const cfg = getConfig();
  const { githubToken } = cfg;
  if (!githubToken) throw new Error('GitHub token not configured. Run: npx software-factory init');

  const parsed = parseGitHubUrl(url);

  if (parsed.type === 'issue') {
    const issueUrl = url;
    const issue = await ghRequest('GET', `/repos/${parsed.repo}/issues/${parsed.number}`, null, githubToken);
    let comments = [];
    try {
      const raw = await ghRequest('GET', `/repos/${parsed.repo}/issues/${parsed.number}/comments?per_page=5`, null, githubToken);
      comments = raw.map(c => `@${c.user.login}: ${c.body}`);
    } catch {}

    const specParts = [
      `TYPE: GitHub Issue`,
      `REPO: ${parsed.repo}`,
      `ISSUE: #${parsed.number} — ${issue.title}`,
      `URL: ${issueUrl}`,
      `STATE: ${issue.state}`,
      `LABELS: ${issue.labels.map(l => l.name).join(', ') || 'none'}`,
      ``,
      `## Issue Description`,
      issue.body || '(no description)',
      comments.length ? `\n## Comments\n${comments.join('\n\n')}` : '',
    ];

    // Auto-trigger SuperPlane pipeline so the workflow is always visible in the cloud
    const pipelineNotice = await autoTriggerPipeline(issueUrl, parsed.repo);

    if (pipelineNotice) {
      // Pipeline triggered — guide agent to monitor SuperPlane instead of doing manual steps
      specParts.push(pipelineNotice);
    } else {
      // No SuperPlane configured — give manual next steps
      specParts.push(
        ``,
        `NEXT STEPS:`,
        `1. get_repo_structure("${parsed.repo}") — explore the codebase`,
        `2. read_repo_file — read key files`,
        `3. [implement the changes in your own context]`,
        `4. push_branch — push implementation + a poc/public/index.html demo page`,
        `5. deploy_preview — get live Render URL (~20s)`,
        `6. create_pr — open PR + comment preview link on this issue`,
      );
    }

    return specParts.filter(x => x !== undefined).join('\n');
  }

  if (parsed.type === 'file') {
    const data = await ghRequest('GET', `/repos/${parsed.repo}/contents/${parsed.path}?ref=${parsed.branch}`, null, githubToken);
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const specParts = [
      `TYPE: GitHub File Spec`,
      `REPO: ${parsed.repo}`,
      `FILE: ${parsed.path} (branch: ${parsed.branch})`,
      ``,
      content,
    ];

    // For file specs, check if they describe an issue-like task and auto-trigger
    const syntheticUrl = `https://github.com/${parsed.repo}`;
    const pipelineNotice = await autoTriggerPipeline(syntheticUrl, parsed.repo);
    if (pipelineNotice) {
      specParts.push(pipelineNotice);
    } else {
      specParts.push(
        ``,
        `NEXT STEPS:`,
        `1. get_repo_structure("${parsed.repo}") — explore the codebase`,
        `2. [implement what's described in the spec above]`,
        `3. push_branch to ${parsed.repo} — push implementation + poc/public/index.html demo`,
        `4. deploy_preview — get live Render URL`,
        `5. create_pr — open PR with preview link`,
      );
    }
    return specParts.join('\n');
  }

  // type === 'repo': look for SPEC.md, spec.md, PROMPT.md, README.md
  const candidates = ['SPEC.md', 'spec.md', 'PROMPT.md', 'prompt.md', '.github/SPEC.md', 'README.md'];
  let specContent = null;
  let specFile = null;

  for (const candidate of candidates) {
    try {
      const data = await ghRequest('GET', `/repos/${parsed.repo}/contents/${candidate}`, null, githubToken);
      if (data.encoding === 'base64') {
        specContent = Buffer.from(data.content, 'base64').toString('utf8');
        specFile = candidate;
        break;
      }
    } catch {}
  }

  if (!specContent) throw new Error(`No spec file found in ${parsed.repo}. Expected SPEC.md, spec.md, PROMPT.md, or README.md`);

  const repoInfo = await ghRequest('GET', `/repos/${parsed.repo}`, null, githubToken);

  const specParts = [
    `TYPE: GitHub Repo Spec`,
    `REPO: ${parsed.repo}`,
    `SPEC FILE: ${specFile}`,
    `DESCRIPTION: ${repoInfo.description || '(none)'}`,
    `DEFAULT BRANCH: ${repoInfo.default_branch}`,
    ``,
    `## Spec`,
    specContent,
  ];

  // Auto-trigger for repo URLs too
  const pipelineNotice = await autoTriggerPipeline(url, parsed.repo);
  if (pipelineNotice) {
    specParts.push(pipelineNotice);
  } else {
    specParts.push(
      ``,
      `NEXT STEPS:`,
      `1. get_repo_structure("${parsed.repo}") — explore the existing codebase`,
      `2. read_repo_file — read key files to understand what already exists`,
      `3. [implement what the spec describes — write code, tests, etc.]`,
      `4. push_branch to ${parsed.repo} — include ALL implementation files + poc/public/index.html as a demo page`,
      `5. deploy_preview("${parsed.repo}", branch) — deploys poc/public/ to Render, returns live URL`,
      `6. create_pr — open PR with Mermaid diagrams, tests passing, and preview URL`,
    );
  }
  return specParts.join('\n');
}

async function impl_getRepoStructure({ repo, path = '', branch }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: npx software-factory init');

  const ref = branch ? `?ref=${branch}` : '';
  const data = await ghRequest('GET', `/repos/${repo}/contents/${path}${ref}`, null, githubToken);
  const items = Array.isArray(data) ? data : [data];
  const lines = [`${repo}/${path || ''} (${branch || 'default branch'})`, ''];
  for (const item of items) {
    const icon = item.type === 'dir' ? '📁' : '📄';
    lines.push(`${icon} ${item.name}${item.type === 'dir' ? '/' : ''}`);
  }
  lines.push('', `${items.length} items`);
  return lines.join('\n');
}

async function impl_readFile({ repo, path, branch }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: npx software-factory init');
  const ref = branch ? `?ref=${branch}` : '';
  const data = await ghRequest('GET', `/repos/${repo}/contents/${path}${ref}`, null, githubToken);
  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  return data.content || '(binary file)';
}

async function impl_pushBranch({ repo, branch, base_branch = 'main', files, commit_message }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: npx software-factory init');
  if (!files?.length) throw new Error('files array is required');

  const baseRef = await ghRequest('GET', `/repos/${repo}/git/ref/heads/${base_branch}`, null, githubToken);
  const baseSha = baseRef.object.sha;
  const baseCommit = await ghRequest('GET', `/repos/${repo}/git/commits/${baseSha}`, null, githubToken);
  const baseTreeSha = baseCommit.tree.sha;

  const treeItems = await Promise.all(files.map(async (f) => {
    const blob = await ghRequest('POST', `/repos/${repo}/git/blobs`, {
      content: f.content,
      encoding: 'utf-8',
    }, githubToken);
    return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));

  const newTree = await ghRequest('POST', `/repos/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeItems,
  }, githubToken);

  const newCommit = await ghRequest('POST', `/repos/${repo}/git/commits`, {
    message: commit_message,
    tree: newTree.sha,
    parents: [baseSha],
  }, githubToken);

  await ghRequest('POST', `/repos/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: newCommit.sha,
  }, githubToken);

  const hasDemoPage = files.some(f => f.path.includes('poc/public') || f.path.endsWith('index.html'));

  return [
    `✅ Branch pushed`,
    ``,
    `Branch:  ${branch}`,
    `Commit:  ${newCommit.sha.slice(0, 7)} — ${commit_message}`,
    `Files:   ${files.map(f => f.path).join(', ')}`,
    `URL:     https://github.com/${repo}/tree/${branch}`,
    hasDemoPage ? `` : `\n⚠️  No demo page found — remember to include poc/public/index.html for the Render preview.`,
    ``,
    `NEXT: Call deploy_preview to get a live URL.`,
  ].filter(l => l !== undefined).join('\n');
}

async function impl_deployPreview({ repo, branch, root_dir = 'poc/public', service_name }) {
  const { renderKey } = getConfig();
  if (!renderKey) throw new Error(
    'Render API key not configured.\nRun: npx software-factory init\nOr: export RENDER_API_KEY=rnd_xxx'
  );

  const name = service_name || renderServiceName(repo);
  let serviceId, serviceUrl;

  // Find existing service by name
  try {
    const all = await renderRequest('GET', '/services?limit=50', null, renderKey);
    const found = all.find(s => (s.service || s).name === name);
    if (found) {
      const svc = found.service || found;
      serviceId = svc.id;
      serviceUrl = svc.serviceDetails?.url;
    }
  } catch {}

  if (serviceId) {
    // Update branch — Render will redeploy automatically
    await renderRequest('PATCH', `/services/${serviceId}`, { branch }, renderKey);
    if (!serviceUrl) {
      const info = await renderRequest('GET', `/services/${serviceId}`, null, renderKey);
      serviceUrl = info.service?.serviceDetails?.url || info.serviceDetails?.url;
    }
  } else {
    // Create new static site (free — no credit card needed)
    const owners = await renderRequest('GET', '/owners?limit=1', null, renderKey);
    const ownerId = owners?.[0]?.owner?.id;
    if (!ownerId) throw new Error('Could not get Render owner ID');

    const svc = await renderRequest('POST', '/services', {
      type: 'static_site',
      name,
      ownerId,
      repo: `https://github.com/${repo}`,
      branch,
      rootDir: root_dir,
      serviceDetails: {
        buildCommand: '',
        publishPath: '.',
        pullRequestPreviewsEnabled: 'yes',
      },
    }, renderKey);

    serviceId = svc.service?.id || svc.id;
    serviceUrl = svc.service?.serviceDetails?.url || svc.serviceDetails?.url;

    // Persist service ID for future fast redeploys
    try {
      const cfg = loadConfig();
      saveConfig({ ...cfg, renderServiceId: serviceId });
    } catch {}
  }

  if (!serviceId) throw new Error('Failed to get or create Render service');

  // Trigger deploy
  const deploy = await renderRequest('POST', `/services/${serviceId}/deploys`, {
    clearCache: 'do_not_clear',
  }, renderKey);
  const deployId = deploy.deploy?.id || deploy.id;

  process.stderr.write(`[factory] Deploying ${name} (${serviceId})...\n`);
  const started = Date.now();

  // Poll — static sites go live in ~20s
  for (let i = 0; i < 75; i++) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const status = await renderRequest('GET', `/services/${serviceId}/deploys/${deployId}`, null, renderKey);
      const s = status.deploy?.status || status.status;
      process.stderr.write(`[factory] ${s} (${fmtMs(Date.now() - started)})\n`);

      if (s === 'live') {
        if (!serviceUrl) {
          const info = await renderRequest('GET', `/services/${serviceId}`, null, renderKey);
          serviceUrl = info.service?.serviceDetails?.url || info.serviceDetails?.url;
        }
        const cfg = getConfig();
        const canvasUrl = cfg.canvasId
          ? `https://app.superplane.com/canvases/${cfg.canvasId}`
          : null;
        return [
          `✅ Live on Render!`,
          ``,
          `🚀 Preview URL:  ${serviceUrl}`,
          `Service:         ${name} (${serviceId})`,
          `Deploy:          ${deployId}`,
          `Time:            ${fmtMs(Date.now() - started)}`,
          canvasUrl ? `🌐 SuperPlane:   ${canvasUrl}` : '',
          ``,
          `NEXT: Call create_pr to open a pull request with this preview URL.`,
        ].filter(Boolean).join('\n');
      }
      if (s === 'failed' || s === 'canceled') {
        throw new Error(`Render deploy ${s} after ${fmtMs(Date.now() - started)}`);
      }
    } catch (e) {
      if (e.message.includes('failed') || e.message.includes('canceled')) throw e;
    }
  }

  throw new Error(`Deploy timed out. Check: https://dashboard.render.com`);
}

async function impl_getDeployStatus({ service_id, deploy_id }) {
  const { renderKey } = getConfig();
  if (!renderKey) throw new Error('Render API key not configured');

  const svc = await renderRequest('GET', `/services/${service_id}`, null, renderKey);
  const url = svc.service?.serviceDetails?.url || svc.serviceDetails?.url;

  if (deploy_id) {
    const d = await renderRequest('GET', `/services/${service_id}/deploys/${deploy_id}`, null, renderKey);
    const s = d.deploy?.status || d.status;
    return `Deploy ${deploy_id}: ${s}\nURL: ${url || 'pending'}`;
  }

  const deploys = await renderRequest('GET', `/services/${service_id}/deploys?limit=1`, null, renderKey);
  const latest = deploys?.[0]?.deploy || deploys?.[0];
  return [
    `Service: ${service_id}`,
    `URL:     ${url || 'pending'}`,
    latest ? `Latest: ${latest.id} — ${latest.status}` : 'No deploys yet',
  ].join('\n');
}

async function impl_createPR({ repo, branch, base = 'main', title, body = '', issue_url, preview_url }) {
  const { githubToken } = getConfig();
  if (!githubToken) throw new Error('GitHub token not configured. Run: npx software-factory init');

  const prBody = [
    body,
    preview_url ? `\n## 🚀 Live Preview\n${preview_url}` : '',
    issue_url ? `\nCloses ${issue_url}` : '',
    `\n---\n*Built with [Software Factory](https://www.npmjs.com/package/software-factory) · Deployed on [Render](https://render.com) · Orchestrated by [SuperPlane](https://superplane.com)*`,
  ].filter(Boolean).join('\n');

  const pr = await ghRequest('POST', `/repos/${repo}/pulls`, {
    title,
    head: branch,
    base,
    body: prBody,
  }, githubToken);

  const prUrl = pr.html_url;

  // Comment on the original issue
  if (issue_url) {
    try {
      const { repo: issueRepo, number } = parseIssueUrl(issue_url);
      const comment = [
        `### 🏭 Software Factory built a PoC!`,
        ``,
        preview_url ? `**🚀 Live Preview:** ${preview_url}` : '',
        `**🔀 Pull Request:** ${prUrl}`,
        ``,
        `| Stage | Status |`,
        `|-------|--------|`,
        `| Spec read | ✅ Done |`,
        `| Implementation | ✅ Done |`,
        preview_url ? `| Deploy to Render | ✅ Live |` : `| Deploy | ⏳ |`,
        `| Pull Request | ✅ Open |`,
        ``,
        `*Built with [Software Factory](https://www.npmjs.com/package/software-factory) · Orchestrated by [SuperPlane](https://superplane.com)*`,
      ].filter(Boolean).join('\n');

      await ghRequest('POST', `/repos/${issueRepo}/issues/${number}/comments`, { body: comment }, githubToken);
    } catch {}
  }

  const cfg2 = getConfig();
  const canvasUrl2 = cfg2.canvasId
    ? `https://app.superplane.com/canvases/${cfg2.canvasId}`
    : null;
  return [
    `✅ Pull Request created!`,
    ``,
    `🔀 PR URL:      ${prUrl}`,
    `   PR #${pr.number}`,
    preview_url ? `🚀 Preview URL: ${preview_url}` : '',
    canvasUrl2 ? `🌐 SuperPlane:  ${canvasUrl2}` : '',
  ].filter(Boolean).join('\n');
}

async function impl_pipelineStatus() {
  const cfg = getConfig();
  if (!cfg.spToken || !cfg.canvasId) return 'Not configured. Run: npx software-factory init';

  const client = new SuperPlaneClient(cfg.spToken);
  const { runs } = await client.listRuns(cfg.canvasId);
  if (!runs?.length) return 'No pipeline runs yet.';

  const STAGES = ['start','fetch-issue','requirement-agent','implementation-agent','validation-agent','render-deploy','pr-agent','create-pr'];
  const lines = [];

  lines.push(`🌐 Canvas: https://app.superplane.com/canvases/${cfg.canvasId}`);
  lines.push('');

  for (const [i, run] of runs.slice(0, 3).entries()) {
    const execs = run.executions || [];
    const byNode = {};
    for (const e of execs) byNode[e.nodeId] = e;
    const dur = run.finishedAt
      ? fmtMs(new Date(run.finishedAt) - new Date(run.createdAt))
      : fmtMs(Date.now() - new Date(run.createdAt)) + ' (running)';

    lines.push(`Run [${i}] ${run.id.slice(0,8)}… state=${run.state} (${dur})`);

    let previewUrl = null;
    let prUrl = null;

    for (const nodeId of STAGES) {
      const ex = byNode[nodeId];
      if (!ex) continue;
      const icon = ex.result === 'RESULT_PASSED' ? '✅'
        : ex.result === 'RESULT_FAILED' ? '❌'
        : ex.state === 'STATE_STARTED' ? '⟳'
        : '·';

      const dur = (ex.state === 'STATE_FINISHED' && ex.createdAt && ex.updatedAt)
        ? ` (${fmtMs(new Date(ex.updatedAt) - new Date(ex.createdAt))})`
        : ex.state === 'STATE_STARTED' && ex.createdAt
        ? ` (${fmtMs(Date.now() - new Date(ex.createdAt))} running…)`
        : '';

      lines.push(`  ${icon} ${nodeId.padEnd(26)}${dur}`);

      const result = ex.resultData || ex.outputs?.data?.[0]?.result;
      if (nodeId === 'render-deploy' && ex.result === 'RESULT_PASSED') {
        previewUrl = result?.preview_url || null;
      }
      if ((nodeId === 'pr-agent' || nodeId === 'create-pr') && ex.result === 'RESULT_PASSED') {
        prUrl = result?.pr_url || result?.html_url || null;
      }
    }

    if (previewUrl) lines.push(`  🚀 Preview URL: ${previewUrl}`);
    if (prUrl)      lines.push(`  🔀 PR URL:      ${prUrl}`);
    lines.push(`  🌐 SuperPlane:  https://app.superplane.com/canvases/${cfg.canvasId}`);

    // Summary for finished runs
    if (run.state === 'STATE_FINISHED') {
      if (previewUrl || prUrl) {
        lines.push('');
        lines.push('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('  ✅  PIPELINE COMPLETE — Share these links:');
        lines.push('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        if (previewUrl) lines.push(`  🚀  Preview:    ${previewUrl}`);
        if (prUrl)      lines.push(`  🔀  PR:         ${prUrl}`);
        lines.push(`  🌐  SuperPlane: https://app.superplane.com/canvases/${cfg.canvasId}`);
        lines.push('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } else if (run.result === 'RESULT_FAILED') {
        lines.push(`  ❌ Pipeline failed — check canvas for logs`);
        lines.push(`  🌐 Canvas: https://app.superplane.com/canvases/${cfg.canvasId}`);
      }
    }

    if (i < 2) lines.push('');
  }

  return lines.join('\n');
}

async function impl_triggerAutonomous({ issue_url, repo }) {
  const cfg = getConfig();
  if (!cfg.spToken || !cfg.canvasId) throw new Error('Not configured. Run: npx software-factory init');

  let parsedRepo, url;
  try {
    const parsed = parseIssueUrl(issue_url);
    parsedRepo = parsed.repo;
    url = parsed.url;
  } catch {
    // Accept repo URLs too
    url = issue_url;
    parsedRepo = issue_url.replace('https://github.com/', '');
  }

  const targetRepo = repo || cfg.targetRepo || parsedRepo;

  const client = new SuperPlaneClient(cfg.spToken);
  await client.triggerCanvas(
    cfg.canvasId,
    cfg.canvasTriggerNodeId || 'start',
    { issue_url: url, repo: targetRepo },
    cfg.canvasTemplateName || 'Build Issue',
  );

  return [
    `✅ Autonomous pipeline triggered on SuperPlane!`,
    ``,
    `Issue:  ${url}`,
    `Repo:   ${targetRepo}`,
    ``,
    `The full pipeline is now running end-to-end on SuperPlane cloud:`,
    `  1. fetch-issue          → reading GitHub issue`,
    `  2. requirement-agent    → Claude writing spec + Mermaid diagram`,
    `  3. implementation-agent → Claude writing code + pushing branch`,
    `  4. validation-agent     → running npm test / lint / build`,
    `  5. render-deploy        → deploying poc/public/ to Render`,
    `  6. pr-agent             → opening PR + commenting preview URL`,
    ``,
    `🌐 Watch live: https://app.superplane.com/canvases/${cfg.canvasId}`,
    ``,
    `📊 Next: call get_pipeline_status every 10-15 seconds to track progress.`,
    `   When state=STATE_FINISHED, extract 🚀 Preview URL and 🔀 PR URL.`,
  ].join('\n');
}

async function impl_doctor() {
  const cfg = getConfig();
  const lines = ['Software Factory — Health Check', ''];

  if (cfg.spToken) {
    try {
      const client = new SuperPlaneClient(cfg.spToken);
      const me = await client.getMe();
      lines.push(`✅ SuperPlane    Connected as ${me.user?.name || me.user?.id}`);
      if (cfg.canvasId) {
        try {
          const { canvas } = await client.getCanvas(cfg.canvasId);
          lines.push(`✅ Canvas        "${canvas.metadata?.name || canvas.name}" (${cfg.canvasId.slice(0,8)}…)`);
          lines.push(`   🌐 https://app.superplane.com/canvases/${cfg.canvasId}`);
        } catch { lines.push(`❌ Canvas        Not found — run: npx software-factory init`); }
      } else {
        lines.push(`❌ Canvas        Not set — run: npx software-factory init`);
      }
    } catch (e) { lines.push(`❌ SuperPlane    ${e.message}`); }
  } else {
    lines.push(`❌ SuperPlane    No token — run: npx software-factory init`);
  }

  if (cfg.githubToken) {
    try {
      const user = await ghRequest('GET', '/user', null, cfg.githubToken);
      lines.push(`✅ GitHub        @${user.login} (${user.name || ''})`);
    } catch (e) { lines.push(`❌ GitHub        ${e.message}`); }
  } else {
    lines.push(`❌ GitHub        Not set — run: npx software-factory init`);
  }

  if (cfg.renderKey) {
    try {
      const owners = await renderRequest('GET', '/owners?limit=1', null, cfg.renderKey);
      const name = owners?.[0]?.owner?.name || 'connected';
      lines.push(`✅ Render        ${name}`);
      if (cfg.renderSvcId) {
        const svc = await renderRequest('GET', `/services/${cfg.renderSvcId}`, null, cfg.renderKey);
        const url = svc.service?.serviceDetails?.url || svc.serviceDetails?.url;
        lines.push(`✅ Live Service  ${url}`);
      }
    } catch (e) { lines.push(`❌ Render        ${e.message}`); }
  } else {
    lines.push(`❌ Render        Not set — run: npx software-factory init`);
  }

  const allGood = !lines.some(l => l.startsWith('❌'));
  lines.push('');
  if (allGood) {
    lines.push('✅ All systems operational! End-to-end workflow:');
    lines.push('');
    lines.push('  1. Give the agent a GitHub issue/repo URL');
    lines.push('  2. fetch_github_spec → auto-triggers SuperPlane pipeline');
    lines.push('  3. SuperPlane runs: spec → code → deploy → PR (all visible in cloud)');
    lines.push('  4. get_pipeline_status → poll until complete');
    lines.push('  5. Report 🚀 Preview URL + 🔀 PR URL to user');
    lines.push('');
    lines.push('  • Repo with spec:  https://github.com/owner/repo');
    lines.push('  • Specific file:   https://github.com/owner/repo/blob/main/SPEC.md');
    lines.push('  • Issue to fix:    https://github.com/owner/repo/issues/42');
    lines.push(`\n  🌐 Canvas: https://app.superplane.com/canvases/${cfg.canvasId || '<not set>'}`);
  } else {
    lines.push('Run: npx software-factory init');
  }

  return lines.join('\n');
}

// ── Request router ────────────────────────────────────────────────────────────

async function handle(req) {
  const { id, method, params } = req;

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'software-factory', version: '0.2.1' },
      capabilities: { tools: {} },
    });
  }

  if (method === 'tools/list') return ok(id, { tools: TOOLS });

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    try {
      let text;
      switch (name) {
        case 'factory_doctor':               text = await impl_doctor(); break;
        case 'fetch_github_spec':            text = await impl_fetchSpec(args); break;
        case 'get_repo_structure':           text = await impl_getRepoStructure(args); break;
        case 'read_repo_file':               text = await impl_readFile(args); break;
        case 'push_branch':                  text = await impl_pushBranch(args); break;
        case 'deploy_preview':               text = await impl_deployPreview(args); break;
        case 'get_deploy_status':            text = await impl_getDeployStatus(args); break;
        case 'create_pr':                    text = await impl_createPR(args); break;
        case 'get_pipeline_status':          text = await impl_pipelineStatus(); break;
        case 'trigger_autonomous_pipeline':  text = await impl_triggerAutonomous(args); break;
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
  process.stderr.write('[software-factory MCP v0.2.1] Ready\n');
  process.stderr.write('Tools: ' + TOOLS.map(t => t.name).join(', ') + '\n');
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
