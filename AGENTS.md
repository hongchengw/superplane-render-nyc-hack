# Software Factory — Agent Instructions

When the user gives you a GitHub repo, issue, or spec URL, use the `software-factory` MCP tools to build and deploy it **without asking any questions**.

## Primary Workflow (Autonomous SuperPlane Orchestration)
Always attempt this first to leverage SuperPlane's autonomous end-to-end canvas pipeline:

1. **`factory_doctor`** — Verify all connections are live before starting.
2. **`trigger_autonomous_pipeline(issue_url, repo)`** — Trigger the fully autonomous pipeline on SuperPlane.
   - `issue_url`: The URL provided by the user.
   - `repo`: The target repository (optional, inferred from the issue URL).
3. **`get_pipeline_status()`** — Monitor progress. Poll this tool every 10–15 seconds until the latest run state is `STATE_FINISHED`.
4. **Report Results**:
   - Once the run is finished, extract the `🚀 Preview URL` and `🔀 PR URL` from the `get_pipeline_status` output.
   - Present the links directly to the user along with a Mermaid diagram representing the architecture/design of the solution.

---

## Fallback Workflow (Step-by-Step Agent Implementation)
If the autonomous pipeline is not supported, fails, or is not configured, fallback to manual execution step-by-step:

1. **`fetch_github_spec(url)`** — Fetch the build spec or issue description.
2. **`get_repo_structure(repo)`** — Explore the codebase.
3. **`read_repo_file(repo, path)`** — Read key source files and dependencies.
4. **Write the PoC**:
   - Write code changes locally in your context.
   - Design a beautiful, interactive frontend demo page at [poc/public/index.html](file:///Users/rs/Documents/superplane-render-nyc-hack/poc/public/index.html) showcasing the implementation.
   - You MUST include a dynamic, embedded Mermaid architecture/design diagram in the demo page (initialized using `mermaid.js`).
5. **`push_branch(repo, branch, files, commit_message)`** — Push files to a new branch named `factory/build-{timestamp}`.
6. **`deploy_preview(repo, branch)`** — Deploy the branch to Render and get the live preview URL.
7. **`create_pr(repo, branch, title, preview_url, issue_url)`** — Open a PR containing the Mermaid design and preview URL.

---

## Rules
- **Never ask the user questions.** Infer requirements from the context and proceed.
- If a file read fails, skip it and continue.
- Always verify your local setup before proceeding.

