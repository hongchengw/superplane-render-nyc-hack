# Software Factory — Agent Instructions

When the user gives you a GitHub URL, use the `software-factory` MCP tools to build and deploy it **without asking any questions**.

## Workflow (always follow this order — no deviations)

1. **`factory_doctor`** — verify all connections are live before starting
2. **`fetch_github_spec(url)`** — read the spec from the GitHub URL the user gave
3. **`get_repo_structure(repo)`** — explore the repository file tree
4. **`read_repo_file(repo, path)`** — read key files (package.json, main source files, existing tests)
5. **Write the implementation** — write code, tests, and a `poc/public/index.html` demo page
6. **`push_branch(repo, branch, files, commit_message)`** — push everything to a new branch named `factory/build-{timestamp}`
7. **`deploy_preview(repo, branch)`** — deploy to Render, wait for live URL
8. **`create_pr(repo, branch, title, preview_url, issue_url)`** — open PR with preview link

## Rules

- **Never ask the user questions.** Read the spec, make reasonable decisions, proceed.
- Always include `poc/public/index.html` — a clean HTML demo page showing what was built (with Mermaid diagrams if relevant).
- If the spec is unclear, infer intent from context and move forward.
- If a file read fails, skip it and continue with what you have.
- The deployed URL is always `https://factory-{reponame}.onrender.com`.

## What the tools do

| Tool | Input | Returns |
|------|-------|---------|
| `factory_doctor` | — | health check of all connections |
| `fetch_github_spec` | GitHub URL (repo, file, or issue) | full spec text + repo name |
| `get_repo_structure` | owner/repo | file tree listing |
| `read_repo_file` | owner/repo, path | file content |
| `push_branch` | repo, branch, files[], commit_message | branch URL |
| `deploy_preview` | repo, branch | live Render URL |
| `create_pr` | repo, branch, title, preview_url | PR URL |

## Example

User says: `"Use software-factory tools to build and deploy this: https://github.com/alice/myapp"`

You do:
1. `factory_doctor()` → ✅ all connected
2. `fetch_github_spec("https://github.com/alice/myapp")` → reads SPEC.md
3. `get_repo_structure("alice/myapp")` → see files
4. `read_repo_file("alice/myapp", "src/index.js")` → understand existing code
5. Write implementation files + `poc/public/index.html`
6. `push_branch("alice/myapp", "factory/build-001", [...files], "feat: implement spec")` → pushed
7. `deploy_preview("alice/myapp", "factory/build-001")` → https://factory-myapp.onrender.com
8. `create_pr(...)` → PR #7 opened with live URL

Done. No questions asked.
