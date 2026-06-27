mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#1f2937',
    primaryTextColor: '#e6edf3',
    primaryBorderColor: '#374151',
    lineColor: '#58a6ff',
    secondaryColor: '#0d1117',
    tertiaryColor: '#161b22',
  },
  flowchart: { useMaxWidth: true, htmlLabels: true },
  sequence: { useMaxWidth: true },
  gantt: { useMaxWidth: true },
});

let currentMode = 'view';
let currentMarkdown = '';

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('view-container').classList.toggle('active', mode === 'view');
  document.getElementById('edit-container').classList.toggle('active', mode === 'edit');
  if (mode === 'view') renderMarkdown(currentMarkdown);
}

async function renderMarkdown(markdown) {
  currentMarkdown = markdown;
  try {
    const html = marked.parse(markdown);
    const container = document.getElementById('rendered-content');
    container.innerHTML = preprocessMermaidBlocks(html);
    renderMermaidDiagrams(container);
    renderMentions(container);
    hljs.highlightAll();
  } catch (e) {
    console.error('Render error:', e);
  }
}

function preprocessMermaidBlocks(html) {
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_, code) => `<div class="mermaid-container"><pre class="mermaid-src">${escapeHtml(code.trim())}</pre></div>`
  );
}

function renderMentions(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  const toReplace = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('code, pre, a, .mermaid')) continue;
    const parts = node.textContent.split(/(@[\w][\w.-]*)/g);
    if (parts.length === 1) continue;
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      if (part.startsWith('@') && /^@[\w][\w.-]*$/.test(part)) {
        const chip = document.createElement('span');
        chip.className = 'node-chip';
        chip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> ${part.slice(1)}`;
        chip.title = `Navigate to ${part}`;
        fragment.appendChild(chip);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    }
    toReplace.push([node, fragment]);
  }
  for (const [oldNode, newFrag] of toReplace) {
    oldNode.parentNode.replaceChild(newFrag, oldNode);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeHtml(str) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

async function renderMermaidDiagrams(container) {
  const blocks = container.querySelectorAll('.mermaid-src');
  if (!blocks.length) return;
  for (const pre of blocks) {
    try {
      const code = decodeHtml(pre.textContent);
      const id = 'mermaid-' + Math.random().toString(36).slice(2, 8);
      const { svg } = await mermaid.render(id, code);
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid';
      wrapper.innerHTML = svg;
      pre.parentNode.replaceChild(wrapper, pre);
    } catch (e) {
      console.error('Mermaid render error:', e);
    }
  }
}

const SAMPLE_MARKDOWN = `# SuperPlane

**Autonomous AI development platform** — from GitHub issue to deployed preview, zero human steps.

> **In view mode, markdown files should render properly with full markdown support.**
> Currently missing: Mermaid.js diagrams, custom chips for node mentions, and general markdown elements.

---

## Features

| Feature | Status | Priority |
|---------|--------|----------|
| Mermaid.js Diagrams | ✅ Done | High |
| @Mention Chips | ✅ Done | High |
| Tables | ✅ Done | Medium |
| Syntax Highlighting | ✅ Done | Medium |
| Task Lists | ✅ Done | Low |

---

## Mermaid.js Diagrams

Diagrams render as interactive SVGs, not raw code blocks:

### Flowchart

\`\`\`mermaid
flowchart LR
    A([🚀 Start]) -->|issue_url| B
    B["📋 Fetch Issue"] --> C
    C["⚙️ Implementation"] --> D
    D["✅ Validation"] --> E
    E["🚢 Deploy to Render"] --> F
    F["🔀 PR Agent"]
    style A fill:#3fb950,stroke:#333,color:#fff
    style F fill:#58a6ff,stroke:#333,color:#fff
\`\`\`

### Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    participant User
    participant CLI as factory
    participant SP as SuperPlane
    participant GH as GitHub
    participant R as Render

    User->>CLI: factory build <issue-url>
    CLI->>SP: POST /hooks/run
    SP->>GH: Fetch issue details
    SP->>SP: Generate implementation spec
    SP->>SP: Write code changes
    SP->>SP: Run tests
    SP->>R: Deploy preview
    R-->>SP: Preview URL
    SP->>GH: Create PR + comment
    GH-->>User: PR with preview link
\`\`\`

### State Diagram

\`\`\`mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> InReview : Submit
    InReview --> Approved : Review OK
    InReview --> ChangesNeeded : Fix requested
    ChangesNeeded --> InReview : Resubmit
    Approved --> Deployed : Deploy
    Deployed --> [*]
\`\`\`

---

## Agent Node Mentions

Reference any node in the pipeline using @mentions — they render as interactive chips:

- Check the latest run status from @ValidationAgent
- Deploy the build using @RenderDeploy
- Review the spec generated by @RequirementAgent
- Merge the PR created by @PRAgent
- Investigate failures logged by @FetchIssue

Click on any chip to navigate to that node.

---

## Code Blocks with Syntax Highlighting

### JavaScript

\`\`\`javascript
async function renderMarkdown(markdown) {
  const res = await fetch('/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  });
  const { html } = await res.json();
  document.getElementById('output').innerHTML = html;
  renderMermaidDiagrams();
}
\`\`\`

### Python

\`\`\`python
def process_pipeline(issue_url: str) -> PipelineResult:
    issue = fetch_issue(issue_url)
    spec = generate_spec(issue)
    branch = implement_changes(spec)
    validation = run_tests(branch)

    if validation.passed:
        preview_url = deploy_to_render(branch)
        pr = create_pull_request(branch, preview_url)
        return PipelineResult(pr=pr, preview=preview_url)
\`\`\`

### JSON

\`\`\`json
{
  "pipeline": {
    "stages": ["fetch", "spec", "code", "test", "deploy", "pr"],
    "status": "running",
    "current_stage": "deploy"
  }
}
\`\`\`

---

## Task Lists

- [x] Mermaid.js diagram rendering
- [x] Custom @mention chips
- [x] Markdown tables
- [x] Syntax highlighting
- [x] Task list support
- [ ] Dark mode toggle
- [ ] Export to PDF
- [ ] Collaborative editing

---

## Blockquotes & Callouts

> **Note:** The view mode renders all markdown elements. Edit mode shows raw text for editing.
>
> Toggle between modes using the buttons in the toolbar above.

---

## Inline Code & Images

Use \`factory build <issue-url>\` to trigger the pipeline.

Inline images work too: ![SuperPlane](https://placehold.co/800x200/1a1a2e/58a6ff?text=SuperPlane+Markdown+Preview)

---

## Horizontal Rules & Misc

Horizontal rule above this paragraph. Below is another one:

---

*Markdown renderer built for the SuperPlane Hackathon · NYC · June 2026*
`;

const editor = document.getElementById('markdown-editor');
editor.value = SAMPLE_MARKDOWN;
editor.addEventListener('input', () => {
  if (currentMode === 'view') renderMarkdown(editor.value);
});
renderMarkdown(SAMPLE_MARKDOWN);
