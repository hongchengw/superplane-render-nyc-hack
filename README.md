<div align="center">

# 🏭 Software Factory

**Give it a GitHub issue. Wake up to a deployed PoC.**

[![npm version](https://img.shields.io/npm/v/software-factory?style=flat-square&color=CB3837&logo=npm)](https://www.npmjs.com/package/software-factory)
[![npm downloads](https://img.shields.io/npm/dm/software-factory?style=flat-square&color=CB3837&logo=npm)](https://www.npmjs.com/package/software-factory)
[![GitHub stars](https://img.shields.io/github/stars/hongchengw/superplane-render-nyc-hack?style=flat-square&logo=github)](https://github.com/hongchengw/superplane-render-nyc-hack/stargazers)
[![GitHub license](https://img.shields.io/github/license/hongchengw/superplane-render-nyc-hack?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![Powered by SuperPlane](https://img.shields.io/badge/powered%20by-SuperPlane-7fe2b4?style=flat-square)](https://superplane.com)
[![Deploy on Render](https://img.shields.io/badge/deploy-Render-46E3B7?style=flat-square&logo=render)](https://render.com)

*Autonomous pipeline: spec → code → tests → deployment → PR — zero human steps.*

Built at the **[SuperPlane Hackathon: Bash Script Funeral /w Render](https://superplane.com)** · NYC, June 27 2026

</div>

---

## Install & Run

```bash
npx software-factory init
npx software-factory build https://github.com/org/repo/issues/42
```

That's it. The factory runs overnight and wakes up with a live preview URL on the PR.

---

## What It Does

```
  you: npx software-factory build https://github.com/org/repo/issues/42

  ──── SuperPlane Pipeline ────────────────────────────────────────────

  [1/6] Fetch Issue         reading title, body, labels from GitHub
  [2/6] Requirement Agent   Claude generates a precise implementation spec
  [3/6] Implementation      Claude writes the code, pushes a branch
  [4/6] Validation          npm install → lint → build → test (retries on fail)
  [5/6] Deploy to Render    preview environment spun up automatically
  [6/6] PR Agent            opens PR + comments the preview URL on the issue

  ──── 8 hours later ─────────────────────────────────────────────────

  you: wake up, check GitHub
  PR: "feat: implement issue #42 [Software Factory]"
  Preview: https://your-preview.onrender.com ✅
```

Every stage validates the previous one before continuing. If tests fail, the pipeline stops and reports exactly what broke.

---

## Commands

```bash
npx software-factory init              # one-time setup wizard
npx software-factory doctor            # verify all prerequisites
npx software-factory build <url>       # trigger the pipeline
npx software-factory status --watch    # live status updates
npx software-factory logs              # per-stage execution output
```

### `init`
Interactive wizard that:
- Stores your API keys as **SuperPlane secrets** (never touches disk)
- Creates the 7-node canvas on your SuperPlane account
- Saves canvas ID to `~/.factory/config.json`

### `doctor`
```
  ✔ SuperPlane API          Connected as your-account
  ✔ Factory Canvas          Canvas "software-factory" (f77c363f...)
  ✔ GitHub Token            GitHub user: @you
  ✔ Render API Key          Render API reachable
  ✔ Secret: anthropic-api-key
  ✔ Secret: github-token
  ✔ Secret: render-api-key
```

### `build <issue-url>`
Accepts:
```bash
factory build https://github.com/owner/repo/issues/42
factory build owner/repo#42
factory build https://github.com/owner/repo/issues/42 --repo owner/other-repo
```

---

## Setup Requirements

| What | Where to get it |
|------|----------------|
| **SuperPlane API token** | [app.superplane.com](https://app.superplane.com) → Profile → API token |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) |
| **GitHub personal access token** | GitHub → Settings → Developer settings → PAT (needs `repo` scope) |
| **Render API key** | [dashboard.render.com/u/settings](https://dashboard.render.com/u/settings) → API Keys |
| **Render Service ID** | Your Render dashboard → the service you want to deploy to |

---

## Architecture

```
  CLI (npx software-factory)
          │
          │ POST /api/v1/canvases/:id/triggers/start/hooks/run
          ▼
  SuperPlane Canvas ─────────────────────────────────────────────────
          │
  ┌───────┴──────────────────────────────────────────────────────┐
  │                                                              │
  │  [start]                                                     │
  │    ↓ (issue_url, repo)                                       │
  │  [fetch-issue]     bash runner → GitHub REST API             │
  │    ↓                                                         │
  │  [requirement-agent]  bash runner → Anthropic API → spec.md  │
  │    ↓                                                         │
  │  [implementation-agent]  runner → Claude → code patches      │
  │    ↓ git clone, apply, push branch                           │
  │  [validation-agent]   runner → npm test/build/lint           │
  │    ↓ (passed channel only)                                   │
  │  [render-deploy]    Render API → preview deployment          │
  │    ↓                                                         │
  │  [pr-agent]         GitHub API → PR + issue comment          │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

The CLI is a thin trigger layer. **SuperPlane owns the full orchestration** — retries, state, parallel runs, and audit trail are all handled by the canvas.

---

## Demo Issues

These are the SuperPlane issues the factory was designed to solve end-to-end:

```bash
factory build https://github.com/superplanehq/superplane/issues/5368  # Markdown view + Mermaid
factory build https://github.com/superplanehq/superplane/issues/5366  # Canvas version diff
factory build https://github.com/superplanehq/superplane/issues/5164  # Send execution to chat
factory build https://github.com/superplanehq/superplane/issues/5704  # Run inspection UX
factory build https://github.com/superplanehq/superplane/issues/5705  # Canvas warnings
```

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=hongchengw/superplane-render-nyc-hack&type=Date)](https://star-history.com/#hongchengw/superplane-render-nyc-hack&Date)

</div>

---

## Contributing

PRs welcome. The pipeline itself lives in `src/superplane/canvas-template.js` — that's where you'd extend stages, add retry logic, or wire in new integrations.

```bash
git clone https://github.com/hongchengw/superplane-render-nyc-hack
cd superplane-render-nyc-hack
npm install
node bin/factory.js --help
```

---

## License

MIT © [Roshan Sharma](https://github.com/hongchengw)

---

<div align="center">

Built with [SuperPlane](https://superplane.com) · Deployed on [Render](https://render.com) · Models by [Anthropic](https://anthropic.com)

</div>
