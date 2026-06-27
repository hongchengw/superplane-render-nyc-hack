# Software Factory — Agent Instructions

When the user gives you a GitHub repo, issue, or spec URL, use the `software-factory` MCP tools to build and deploy it **without asking any questions**.

## ⚡ How It Works (End-to-End via SuperPlane)

Every workflow runs **end-to-end through SuperPlane cloud**. The moment you call `fetch_github_spec` or `trigger_autonomous_pipeline`, the full pipeline is triggered on SuperPlane and becomes visible live in the SuperPlane canvas UI.

You can watch every stage in real time at the Canvas URL returned by `factory_doctor`.

---

## Primary Workflow (Recommended — Fully Autonomous)

```
factory_doctor  →  trigger_autonomous_pipeline  →  get_pipeline_status (poll)  →  report URLs
```

1. **`factory_doctor`** — Verify all connections are live. Note the Canvas URL.
2. **`trigger_autonomous_pipeline(issue_url, repo)`** — Trigger the fully autonomous pipeline on SuperPlane.
   - `issue_url`: The GitHub issue or repo URL provided by the user.
   - `repo`: The target repository (optional, inferred from the issue URL).
   - SuperPlane will run **all 6 stages** end-to-end: fetch → spec → implement → validate → deploy → PR.
3. **`get_pipeline_status()`** — Monitor progress. Poll every 10–15 seconds until `STATE_FINISHED`.
   - Watch for each stage: `fetch-issue` → `requirement-agent` → `implementation-agent` → `validation-agent` → `render-deploy` → `pr-agent`
4. **Report Results**:
   - Extract the `🚀 Preview URL` and `🔀 PR URL` from the `get_pipeline_status` output.
   - Present the links to the user along with a Mermaid architecture diagram from the spec.

---

## Alternative Entry Point (Via fetch_github_spec)

If you call `fetch_github_spec` first (e.g. to read a spec before building), it will **automatically trigger the SuperPlane pipeline** in the background. After it returns:

1. Do NOT call `push_branch`, `deploy_preview`, or `create_pr` manually — the pipeline handles these.
2. Instead, immediately call **`get_pipeline_status`** and poll until `STATE_FINISHED`.
3. Report the URLs to the user.

---

## Fallback Workflow (Manual — Only If Autonomous Pipeline Fails)

If SuperPlane is not configured or the pipeline fails, fall back to manual execution:

1. **`fetch_github_spec(url)`** — Fetch the build spec or issue description.
2. **`get_repo_structure(repo)`** — Explore the codebase.
3. **`read_repo_file(repo, path)`** — Read key source files and dependencies.
4. **Write the PoC**:
   - Write code changes locally in your context.
   - Design a beautiful, interactive frontend demo page at `poc/public/index.html` showcasing the implementation.
   - You MUST include a dynamic, embedded Mermaid architecture/design diagram in the demo page (initialized using `mermaid.js`).
5. **`push_branch(repo, branch, files, commit_message)`** — Push files to a new branch named `factory/build-{timestamp}`.
6. **`deploy_preview(repo, branch)`** — Deploy the branch to Render and get the live preview URL.
7. **`create_pr(repo, branch, title, preview_url, issue_url)`** — Open a PR containing the Mermaid design and preview URL.

---

## Rules

- **Never ask the user questions.** Infer requirements from the context and proceed.
- **Always use `trigger_autonomous_pipeline` first** — this ensures everything is visible in SuperPlane.
- If `fetch_github_spec` triggers the pipeline automatically, do NOT also call `push_branch`/`deploy_preview`/`create_pr`.
- If a file read fails, skip it and continue.
- Always verify your local setup with `factory_doctor` before starting.
- Always present the Canvas URL to the user so they can watch the live pipeline.
