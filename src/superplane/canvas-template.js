/**
 * Generates the SuperPlane canvas spec for the Software Factory pipeline.
 *
 * Pipeline:
 *  start → fetch-issue → requirement-agent → implementation-agent
 *        → validation-agent → git-agent → render-deploy → pr-comment
 */
export function buildCanvasSpec(opts = {}) {
  const {
    claudeIntegrationId,
    githubIntegrationId,
    renderIntegrationId,
    renderServiceId,
    targetRepo,        // "owner/repo"
    anthropicApiKeySecret = 'anthropic-api-key',
    githubTokenSecret = 'github-token',
    renderApiKeySecret = 'render-api-key',
    machineType = 'aws-standard-1',  // fleet ID for e1-large-amd64
  } = opts;

  // secret env var: valueSource="secret", secret.secret=<secret-name>, secret.key=<key>
  const env = (vars) =>
    vars.map(([name, secretName]) => ({
      name,
      valueSource: 'secret',
      secret: { secret: secretName, key: 'value' },
    }));

  const literal = (name, value) => ({ name, valueSource: 'literal', value });

  const nodes = [
    // ── 1. Manual trigger ──────────────────────────────────────────────────
    {
      id: 'start',
      name: 'Start Factory',
      type: 'TYPE_TRIGGER',
      component: 'start',
      configuration: {
        templates: [
          {
            name: 'Build Issue',
            parameters: [
              { name: 'issue_url', type: 'string', title: 'GitHub Issue URL' },
              { name: 'repo', type: 'string', title: 'Target repo (owner/repo)', defaultString: targetRepo || 'superplanehq/superplane' },
            ],
            payload: {
              issue_url: '{{ parameters["issue_url"] }}',
              repo: '{{ parameters["repo"] }}',
            },
          },
        ],
      },
      position: { x: 0, y: 0 },
    },

    // ── 2. Fetch Issue ─────────────────────────────────────────────────────
    {
      id: 'fetch-issue',
      name: 'Fetch Issue',
      type: 'TYPE_ACTION',
      component: 'runnerBash',
      configuration: {
        machine_type: machineType,
        execution_mode: 'docker',
        docker_image_preset: 'debian:bookworm-slim',
        enable_setup_commands: true,
        setup_commands: 'apt-get update -qq && apt-get install -y -qq curl jq',
        script: `#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=$(cat "$SUPERPLANE_PAYLOAD_FILE")
# root event data comes in as the payload directly
ISSUE_URL=$(echo "$PAYLOAD" | jq -r '.issue_url // .parameters.issue_url // empty')
REPO=$(echo "$PAYLOAD" | jq -r '.repo // .parameters.repo // empty')

# Parse issue number from URL like https://github.com/owner/repo/issues/123
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')

echo "Fetching issue #$ISSUE_NUMBER from $REPO..."

ISSUE=$(curl -sf \\
  -H "Authorization: Bearer $GITHUB_TOKEN" \\
  -H "Accept: application/vnd.github.v3+json" \\
  "https://api.github.com/repos/$REPO/issues/$ISSUE_NUMBER")

TITLE=$(echo "$ISSUE" | jq -r '.title')
BODY=$(echo "$ISSUE" | jq -r '.body // ""')
LABELS=$(echo "$ISSUE" | jq -r '[.labels[].name] | join(", ")')
STATE=$(echo "$ISSUE" | jq -r '.state')

echo "Issue: $TITLE"
echo "State: $STATE"
echo "Labels: $LABELS"

jq -n \\
  --arg url "$ISSUE_URL" \\
  --arg repo "$REPO" \\
  --argjson number "$ISSUE_NUMBER" \\
  --arg title "$TITLE" \\
  --arg body "$BODY" \\
  --arg labels "$LABELS" \\
  '{issue_url: $url, repo: $repo, issue_number: $number, title: $title, body: $body, labels: $labels}' \\
  > "$SUPERPLANE_RESULT_FILE"

echo "Done fetching issue."
`,
        environment: claudeIntegrationId ? [] : env([['GITHUB_TOKEN', githubTokenSecret]]),
      },
      position: { x: 320, y: 0 },
    },

    // ── 3. Requirement Agent ───────────────────────────────────────────────
    ...(claudeIntegrationId
      ? [{
          id: 'requirement-agent',
          name: 'Requirement Agent',
          type: 'TYPE_ACTION',
          component: 'claude.textPrompt',
          ...(claudeIntegrationId ? { integration: { id: claudeIntegrationId } } : {}),
          configuration: {
            model: 'claude-sonnet-4-6',
            maxTokens: 8096,
            systemMessage: 'You are a senior software engineer analysing a GitHub issue. Produce a precise implementation spec in markdown.',
            prompt: `Analyse this GitHub issue and produce a detailed implementation spec.

Issue Title: {{ $["Fetch Issue"].data[0].result.title }}
Issue Body:
{{ $["Fetch Issue"].data[0].result.body }}

Your spec MUST include:
1. **Summary** — one-paragraph summary of what needs to be built
2. **Architecture Diagram** — a Mermaid block (sequence diagram, flowchart, or state diagram) representing the system flow/design of the changes
3. **Acceptance Criteria** — numbered checklist of testable requirements
4. **Files Likely Affected** — list with brief rationale
5. **Implementation Plan** — ordered numbered steps
6. **Edge Cases & Risks** — anything that could break

Output ONLY the markdown spec, no preamble.`,
          },
          position: { x: 640, y: 0 },
        }]
      : [{
          id: 'requirement-agent',
          name: 'Requirement Agent',
          type: 'TYPE_ACTION',
          component: 'runnerBash',
          configuration: {
            machine_type: machineType,
            execution_mode: 'docker',
            docker_image_preset: 'debian:bookworm-slim',
            enable_setup_commands: true,
            setup_commands: 'apt-get update -qq && apt-get install -y -qq nodejs npm jq',
            script: `#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=$(cat "$SUPERPLANE_PAYLOAD_FILE")
TITLE=$(echo "$PAYLOAD" | jq -r '.[0].result.title // .result.title // ""')
BODY=$(echo "$PAYLOAD" | jq -r '.[0].result.body // .result.body // ""')
LABELS=$(echo "$PAYLOAD" | jq -r '.[0].result.labels // .result.labels // ""')

node - <<'NODEJS'
const https = require('https');
const fs = require('fs');

const payload = JSON.parse(fs.readFileSync(process.env.SUPERPLANE_PAYLOAD_FILE, 'utf8'));
const title = payload[0]?.result?.title || payload?.result?.title || 'Unknown';
const body = payload[0]?.result?.body || payload?.result?.body || '';
const labels = payload[0]?.result?.labels || payload?.result?.labels || '';

const systemPrompt = 'You are a senior software engineer analysing a GitHub issue. Produce a precise implementation spec in markdown.';
const userPrompt = \`Analyse this GitHub issue and produce a detailed implementation spec.

Issue Title: \${title}
Labels: \${labels}
Issue Body:
\${body}

Your spec MUST include:
1. **Summary** — one-paragraph summary of what needs to be built
2. **Architecture Diagram** — a Mermaid block (sequence diagram, flowchart, or state diagram) representing the system flow/design of the changes
3. **Acceptance Criteria** — numbered checklist of testable requirements
4. **Files Likely Affected** — list with brief rationale
5. **Implementation Plan** — ordered numbered steps
6. **Edge Cases & Risks** — anything that could break

Output ONLY the markdown spec, no preamble.\`;

const data = JSON.stringify({
  model: 'claude-sonnet-4-6',
  max_tokens: 8096,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }],
});

const req = https.request({
  hostname: 'api.anthropic.com',
  path: '/v1/messages',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'Content-Length': Buffer.byteLength(data),
  },
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const result = JSON.parse(body);
    const spec = result.content?.[0]?.text || '';
    console.log('Generated spec:', spec.slice(0, 200) + '...');
    fs.writeFileSync(process.env.SUPERPLANE_RESULT_FILE, JSON.stringify({ spec }));
  });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.write(data);
req.end();
NODEJS
`,
            environment: env([
              ['ANTHROPIC_API_KEY', anthropicApiKeySecret],
            ]),
          },
          position: { x: 640, y: 0 },
        }]),

    // ── 4. Implementation Agent ────────────────────────────────────────────
    {
      id: 'implementation-agent',
      name: 'Implementation Agent',
      type: 'TYPE_ACTION',
      component: 'runnerBash',
      configuration: {
        machine_type: machineType,
        execution_mode: 'docker',
        docker_image_preset: 'debian:bookworm-slim',
        enable_setup_commands: true,
        setup_commands: 'apt-get update -qq && apt-get install -y -qq git curl nodejs npm jq',
        script: [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          '',
          'PAYLOAD=$(cat "$SUPERPLANE_PAYLOAD_FILE")',
          'REPO=$(echo "$PAYLOAD" | jq -r \'.[]?.result?.repo // empty\' | head -1)',
          'ISSUE_NUMBER=$(echo "$PAYLOAD" | jq -r \'.[]?.result?.issue_number // empty\' | head -1)',
          'ISSUE_NUMBER=${ISSUE_NUMBER:-0}',
          '',
          '# Extract spec text from requirement-agent output',
          'SPEC=$(node -e \'',
          '  const p = JSON.parse(require("fs").readFileSync(process.env.SUPERPLANE_PAYLOAD_FILE));',
          '  const arr = Array.isArray(p) ? p : [p];',
          '  for (const item of arr) {',
          '    const t = item?.result?.spec || item?.response?.content?.[0]?.text;',
          '    if (t) { process.stdout.write(t); break; }',
          '  }',
          '\')',
          '',
          'echo "Spec length: ${#SPEC}"',
          'echo "Implementing issue #$ISSUE_NUMBER on $REPO..."',
          '',
          'git config --global user.email "factory@superplane.com"',
          'git config --global user.name "Software Factory"',
          '',
          'BRANCH_NAME="factory/issue-${ISSUE_NUMBER}-auto-impl"',
          'WORK_DIR="/tmp/factory-work"',
          'rm -rf "$WORK_DIR"',
          '',
          'git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" "$WORK_DIR"',
          'cd "$WORK_DIR"',
          'git checkout -b "$BRANCH_NAME"',
          '',
          '# Write the implementation script and run it',
          'cat > /tmp/implement.js << \'JSEOF\'',
          'const https = require("https");',
          'const fs = require("fs");',
          'const path = require("path");',
          'const { execSync } = require("child_process");',
          '',
          'const spec = process.env.SPEC || "";',
          'const repo = process.env.REPO || "";',
          'const issueNumber = process.env.ISSUE_NUMBER || "0";',
          'const branch = process.env.BRANCH_NAME || "";',
          '',
          'const repoFiles = execSync(',
          '  "find . \\\\( -name \\"*.ts\\" -o -name \\"*.tsx\\" -o -name \\"*.js\\" -o -name \\"*.jsx\\" -o -name \\"*.go\\" -o -name \\"*.py\\" \\\\)" +',
          '  " | grep -v node_modules | grep -v .git | head -50"',
          ').toString().trim();',
          '',
          'const prompt = `You are implementing a GitHub issue in a real codebase.',
          '',
          'IMPLEMENTATION SPEC:',
          '${spec}',
          '',
          'REPOSITORY FILES (key files):',
          '${repoFiles}',
          '',
          'Generate the minimal code changes to implement this spec.',
          'IMPORTANT: You MUST generate or update the file \\"poc/public/index.html\\" to serve as a stunning, premium interactive frontend demo page of the implementation. The demo page MUST include:',
          '1. A clean, premium header indicating it is a Software Factory PoC.',
          '2. An interactive dashboard or testing area demonstrating the feature/changes.',
          '3. An embedded dynamic Mermaid architecture diagram from the spec using the mermaid.js library (initialized via mermaid.initialize({ startOnLoad: true })).',
          '4. Curated modern styling (sleek fonts, subtle gradients, rich layout).',
          '',
          'Return ONLY a JSON object:',
          '{',
          '  "summary": "one-line summary",',
          '  "files": [{"path": "path/to/file", "operation": "create|update", "content": "full file content"}],',
          '  "test_command": "npm test",',
          '  "notes": "implementation notes"',
          '}`;',
          '',
          'const body = JSON.stringify({',
          '  model: "claude-sonnet-4-6",',
          '  max_tokens: 16384,',
          '  messages: [{ role: "user", content: prompt }],',
          '});',
          '',
          'const req = https.request({',
          '  hostname: "api.anthropic.com",',
          '  path: "/v1/messages",',
          '  method: "POST",',
          '  headers: {',
          '    "Content-Type": "application/json",',
          '    "x-api-key": process.env.ANTHROPIC_API_KEY,',
          '    "anthropic-version": "2023-06-01",',
          '    "Content-Length": Buffer.byteLength(body),',
          '  },',
          '}, (res) => {',
          '  let data = "";',
          '  res.on("data", c => data += c);',
          '  res.on("end", () => {',
          '    const result = JSON.parse(data);',
          '    const text = result.content?.[0]?.text || "{}";',
          '    const m = text.match(/\\{[\\s\\S]*\\}/);',
          '    if (!m) { console.error("No JSON in response:", text.slice(0,300)); process.exit(1); }',
          '    const impl = JSON.parse(m[0]);',
          '    for (const f of (impl.files || [])) {',
          '      const dir = path.dirname(f.path);',
          '      if (dir !== ".") fs.mkdirSync(dir, { recursive: true });',
          '      fs.writeFileSync(f.path, f.content);',
          '      console.log("Written:", f.path);',
          '    }',
          '    fs.writeFileSync(process.env.SUPERPLANE_RESULT_FILE, JSON.stringify({',
          '      branch, repo, issue_number: parseInt(issueNumber),',
          '      summary: impl.summary, files_changed: (impl.files||[]).map(f=>f.path),',
          '      test_command: impl.test_command, notes: impl.notes,',
          '    }));',
          '  });',
          '});',
          'req.on("error", e => { console.error(e); process.exit(1); });',
          'req.write(body);',
          'req.end();',
          'JSEOF',
          '',
          'export SPEC REPO ISSUE_NUMBER BRANCH_NAME',
          'node /tmp/implement.js',
          '',
          '# Commit and push',
          'git add -A',
          'git diff --cached --quiet && echo "No changes to commit" && exit 0',
          'git commit -m "feat: implement issue #${ISSUE_NUMBER} via Software Factory"',
          'git push "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" "${BRANCH_NAME}"',
          'echo "Branch ${BRANCH_NAME} pushed successfully."',
        ].join('\n'),
        environment: env([
          ['ANTHROPIC_API_KEY', anthropicApiKeySecret],
          ['GITHUB_TOKEN', githubTokenSecret],
        ]),
      },
      position: { x: 960, y: 0 },
    },

    // ── 5. Validation Agent ────────────────────────────────────────────────
    {
      id: 'validation-agent',
      name: 'Validation Agent',
      type: 'TYPE_ACTION',
      component: 'runnerBash',
      configuration: {
        machine_type: machineType,
        execution_mode: 'docker',
        docker_image_preset: 'debian:bookworm-slim',
        enable_setup_commands: true,
        setup_commands: 'apt-get update -qq && apt-get install -y -qq git curl nodejs npm jq',
        script: `#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=$(cat "$SUPERPLANE_PAYLOAD_FILE")

# Extract branch/repo from previous node result
extract() { echo "$PAYLOAD" | jq -r ".[0].result.$1 // .result.$1 // empty"; }
REPO=$(extract repo)
BRANCH=$(extract branch)
ISSUE_NUMBER=$(extract issue_number)
TEST_CMD=$(extract test_command)
TEST_CMD=\${TEST_CMD:-"npm test"}

echo "Validating branch $BRANCH on $REPO..."

git config --global user.email "factory@superplane.com"
git config --global user.name "Software Factory"

WORK_DIR="/tmp/factory-validate"
git clone -b "$BRANCH" "https://x-access-token:\${GITHUB_TOKEN}@github.com/\${REPO}.git" "$WORK_DIR"
cd "$WORK_DIR"

VALIDATION_RESULT="passed"
VALIDATION_LOG=""
EXIT_CODE=0

# Install deps
if [ -f "package.json" ]; then
  echo "Running npm install..."
  npm install --prefer-offline 2>&1 | tail -5 || true
fi

# Run lint if available
if grep -q '"lint"' package.json 2>/dev/null; then
  echo "Running lint..."
  npm run lint 2>&1 | tail -20 || { VALIDATION_RESULT="failed"; EXIT_CODE=1; }
fi

# Run build if available
if grep -q '"build"' package.json 2>/dev/null; then
  echo "Running build..."
  npm run build 2>&1 | tail -20 || { VALIDATION_RESULT="failed"; EXIT_CODE=1; }
fi

# Run tests
echo "Running tests: $TEST_CMD"
TEST_OUTPUT=$($TEST_CMD 2>&1 | tail -40) || { VALIDATION_RESULT="failed"; EXIT_CODE=1; }
VALIDATION_LOG="$TEST_OUTPUT"

jq -n \\
  --arg repo "$REPO" \\
  --arg branch "$BRANCH" \\
  --argjson issue "$ISSUE_NUMBER" \\
  --arg result "$VALIDATION_RESULT" \\
  --arg log "$VALIDATION_LOG" \\
  '{repo: $repo, branch: $branch, issue_number: $issue, validation_result: $result, validation_log: $log}' \\
  > "$SUPERPLANE_RESULT_FILE"

exit $EXIT_CODE
`,
        environment: env([['GITHUB_TOKEN', githubTokenSecret]]),
      },
      position: { x: 1280, y: 0 },
    },

    // ── 6. Deploy to Render (via Render REST API) ─────────────────────────
    {
      id: 'render-deploy',
      name: 'Deploy to Render',
      type: 'TYPE_ACTION',
      component: 'runnerBash',
      configuration: {
        machine_type: machineType,
        execution_mode: 'docker',
        docker_image_preset: 'debian:bookworm-slim',
        enable_setup_commands: true,
        setup_commands: 'apt-get update -qq && apt-get install -y -qq curl jq git',
        script: `#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=$(cat "$SUPERPLANE_PAYLOAD_FILE")
extract() { echo "$PAYLOAD" | jq -r ".[0].result.$1 // .[1].result.$1 // .result.$1 // empty"; }
REPO=$(extract repo)
BRANCH=$(extract branch)
ISSUE_NUMBER=$(extract issue_number)

echo "=== Render Deployment ==="
echo "Service: $RENDER_SERVICE_ID"
echo "Branch:  $BRANCH"

# Update the service branch (points Render at our new branch)
curl -sf -X PATCH \\
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID" \\
  -H "Authorization: Bearer $RENDER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"branch\\": \\"$BRANCH\\"}" > /dev/null

# Trigger deploy
DEPLOY_RESPONSE=$(curl -sf -X POST \\
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \\
  -H "Authorization: Bearer $RENDER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"clearCache": "do_not_clear"}')

DEPLOY_ID=$(echo "$DEPLOY_RESPONSE" | jq -r '.deploy.id // .id // empty')
echo "Deploy triggered: $DEPLOY_ID"

# Poll until live (static sites: ~20s, web services: 1-3min)
for i in $(seq 1 60); do
  sleep 8
  STATUS=$(curl -sf \\
    "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys/$DEPLOY_ID" \\
    -H "Authorization: Bearer $RENDER_API_KEY" | jq -r '.deploy.status // .status // "unknown"')
  echo "[$i] $STATUS"
  [ "$STATUS" = "live" ] && break
  if [ "$STATUS" = "failed" ] || [ "$STATUS" = "canceled" ]; then
    echo "Deploy $STATUS"
    exit 1
  fi
done

# Get live URL
SERVICE_URL=$(curl -sf \\
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID" \\
  -H "Authorization: Bearer $RENDER_API_KEY" | jq -r '.service.serviceDetails.url // .serviceDetails.url // empty')

echo "Live at: $SERVICE_URL"

jq -n \\
  --arg repo "$REPO" \\
  --arg branch "$BRANCH" \\
  --argjson issue "\${ISSUE_NUMBER:-0}" \\
  --arg deploy_id "$DEPLOY_ID" \\
  --arg url "$SERVICE_URL" \\
  '{repo: $repo, branch: $branch, issue_number: $issue, deploy_id: $deploy_id, preview_url: $url}' \\
  > "$SUPERPLANE_RESULT_FILE"
`,
        environment: [
          ...env([
            ['RENDER_API_KEY', renderApiKeySecret],
            ['RENDER_SERVICE_ID', 'render-service-id'],
          ]),
        ],
      },
      position: { x: 1600, y: 0 },
    },

    // ── 7. Create PR + Comment ─────────────────────────────────────────────
    ...(githubIntegrationId
      ? [
          {
            id: 'create-pr',
            name: 'Create Pull Request',
            type: 'TYPE_ACTION',
            component: 'github.createPullRequest',
            integration: { id: githubIntegrationId },
            configuration: {
              repository: targetRepo || '{{ $["Validation Agent"].data[0].result.repo }}',
              title: '{{ $["Fetch Issue"].data[0].result.title }}',
              body: `### Software Factory Auto-Implementation

**Issue**: #{{ $["Fetch Issue"].data[0].result.issue_number }}
**Branch**: \`{{ $["Validation Agent"].data[0].result.branch }}\`
**Validation**: {{ $["Validation Agent"].data[0].result.validation_result }}

**Preview**: {{ $["Deploy to Render"].data[0].result.preview_url }}

---
*Generated by [SuperPlane Software Factory](https://superplane.com)*`,
              head: '{{ $["Validation Agent"].data[0].result.branch }}',
              base: 'main',
            },
            position: { x: 1920, y: 0 },
          },
          {
            id: 'pr-comment',
            name: 'Post Preview URL',
            type: 'TYPE_ACTION',
            component: 'github.createIssueComment',
            integration: { id: githubIntegrationId },
            configuration: {
              repository: targetRepo || '{{ $["Validation Agent"].data[0].result.repo }}',
              issue_number: '{{ $["Fetch Issue"].data[0].result.issue_number }}',
              body: `### Software Factory has built a PoC for this issue! 🏭

**Preview**: {{ $["Deploy to Render"].data[0].result.preview_url }}
**PR**: {{ $["Create Pull Request"].data[0].result.html_url }}

| Stage | Status |
|-------|--------|
| Requirements | ✅ Parsed |
| Implementation | ✅ Generated |
| Validation | {{ $["Validation Agent"].data[0].result.validation_result }} |
| Deployment | ✅ Live on Render |

*Built overnight by [SuperPlane Software Factory](https://superplane.com)*`,
            },
            position: { x: 2240, y: 0 },
          },
        ]
      : [{
          id: 'pr-agent',
          name: 'Create PR & Comment',
          type: 'TYPE_ACTION',
          component: 'runnerBash',
          configuration: {
            machine_type: machineType,
            execution_mode: 'docker',
            docker_image_preset: 'debian:bookworm-slim',
            enable_setup_commands: true,
            setup_commands: 'apt-get update -qq && apt-get install -y -qq curl jq python3',
            script: `#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=$(cat "$SUPERPLANE_PAYLOAD_FILE")
extract() {
  echo "$PAYLOAD" | python3 -c "
import json, sys
p = json.load(sys.stdin)
arr = p if isinstance(p, list) else [p]
for item in arr:
    r = item.get('result', {})
    if '$1' in r:
        print(r['$1'])
        break
" 2>/dev/null || echo ""
}

REPO=$(extract repo)
BRANCH=$(extract branch)
ISSUE_NUMBER=$(extract issue_number)
PREVIEW_URL=$(extract preview_url)
ISSUE_TITLE=$(echo "$PAYLOAD" | jq -r '.[0].result.title // .[1].result.title // "Software Factory Implementation"')
VALIDATION=$(echo "$PAYLOAD" | jq -r '.[0].result.validation_result // .[1].result.validation_result // "unknown"')

echo "Creating PR for branch $BRANCH on $REPO..."

# Extract Mermaid diagram if present
MERMAID_DIAGRAM=$(echo "$PAYLOAD" | python3 -c "
import json, sys, re
p = json.load(sys.stdin)
arr = p if isinstance(p, list) else [p]
for item in arr:
    spec = ''
    if 'result' in item and isinstance(item['result'], dict):
        spec = item['result'].get('spec', '')
    elif 'response' in item and isinstance(item['response'], dict):
        content = item['response'].get('content', [])
        if content and len(content) > 0 and isinstance(content[0], dict):
            spec = content[0].get('text', '')
    if spec:
        m = re.search(r'(\`\`\`mermaid[\\s\\S]*?\`\`\`)', spec)
        if m:
            print(m.group(1))
            break
" 2>/dev/null || echo "")

BODY="### Software Factory Auto-Implementation

**Issue**: #$ISSUE_NUMBER
**Branch**: \`$BRANCH\`
**Validation**: $VALIDATION
**Preview**: $PREVIEW_URL"

if [ -n "$MERMAID_DIAGRAM" ]; then
  BODY="$BODY

## 📊 Design & Architecture
$MERMAID_DIAGRAM"
fi

BODY="$BODY

---
*Generated by [SuperPlane Software Factory](https://superplane.com)*"

# Create PR
PR_RESPONSE=$(curl -sf -X POST \\
  "https://api.github.com/repos/$REPO/pulls" \\
  -H "Authorization: Bearer $GITHUB_TOKEN" \\
  -H "Accept: application/vnd.github.v3+json" \\
  -H "Content-Type: application/json" \\
  -d "$(jq -n \\
    --arg title "feat: $ISSUE_TITLE [Software Factory]" \\
    --arg head "$BRANCH" \\
    --arg body "$BODY" \\
    '{title: $title, head: $head, base: "main", body: $body}')"
  )

PR_URL=$(echo "$PR_RESPONSE" | jq -r '.html_url // empty')
PR_NUMBER=$(echo "$PR_RESPONSE" | jq -r '.number // 0')
echo "PR created: $PR_URL"

# Comment on the original issue
COMMENT_BODY=$(jq -n \\
  --arg preview "$PREVIEW_URL" \\
  --arg pr_url "$PR_URL" \\
  --arg validation "$VALIDATION" \\
  '"### Software Factory has built a PoC for this issue! 🏭\\n\\n**Preview**: " + $preview + "\\n**PR**: " + $pr_url + "\\n\\n| Stage | Status |\\n|-------|--------|\\n| Requirements | ✅ Parsed |\\n| Implementation | ✅ Generated |\\n| Validation | " + $validation + " |\\n| Deployment | ✅ Live on Render |\\n\\n*Built overnight by [SuperPlane Software Factory](https://superplane.com)*"'
)

curl -sf -X POST \\
  "https://api.github.com/repos/$REPO/issues/$ISSUE_NUMBER/comments" \\
  -H "Authorization: Bearer $GITHUB_TOKEN" \\
  -H "Accept: application/vnd.github.v3+json" \\
  -H "Content-Type: application/json" \\
  -d "$(jq -n --arg body "$(echo $COMMENT_BODY | jq -r .)" '{body: $body}')"

echo "Commented on issue #$ISSUE_NUMBER"

jq -n \\
  --arg repo "$REPO" \\
  --arg branch "$BRANCH" \\
  --argjson issue "$ISSUE_NUMBER" \\
  --arg pr_url "$PR_URL" \\
  --argjson pr_number "$PR_NUMBER" \\
  --arg preview "$PREVIEW_URL" \\
  '{repo: $repo, branch: $branch, issue_number: $issue, pr_url: $pr_url, pr_number: $pr_number, preview_url: $preview}' \\
  > "$SUPERPLANE_RESULT_FILE"
`,
            environment: env([['GITHUB_TOKEN', githubTokenSecret]]),
          },
          position: { x: 1920, y: 0 },
        }]),
  ];

  const edges = [
    { sourceId: 'start', targetId: 'fetch-issue', channel: 'default' },
    { sourceId: 'fetch-issue', targetId: 'requirement-agent', channel: 'passed' },
    { sourceId: 'requirement-agent', targetId: 'implementation-agent', channel: 'passed' },
    { sourceId: 'implementation-agent', targetId: 'validation-agent', channel: 'passed' },
    { sourceId: 'validation-agent', targetId: 'render-deploy', channel: 'passed' },
    ...(githubIntegrationId
      ? [
          { sourceId: 'render-deploy', targetId: 'create-pr', channel: 'passed' },
          { sourceId: 'create-pr', targetId: 'pr-comment', channel: 'default' },
        ]
      : [
          { sourceId: 'render-deploy', targetId: 'pr-agent', channel: 'passed' },
        ]
    ),
  ];

  return { nodes, edges };
}
