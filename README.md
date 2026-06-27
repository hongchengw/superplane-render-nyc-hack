<div align="center">

# 🏭 Software Factory

**Give it a GitHub URL. Get a deployed app + PR — orchestrated by SuperPlane.**

[![npm version](https://img.shields.io/npm/v/software-factory?style=flat-square&color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/software-factory)
[![npm downloads](https://img.shields.io/npm/dm/software-factory?style=flat-square&color=CB3837)](https://www.npmjs.com/package/software-factory)
[![GitHub stars](https://img.shields.io/github/stars/hongchengw/superplane-render-nyc-hack?style=flat-square&logo=github)](https://github.com/hongchengw/superplane-render-nyc-hack/stargazers)
[![license](https://img.shields.io/github/license/hongchengw/superplane-render-nyc-hack?style=flat-square)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![Powered by SuperPlane](https://img.shields.io/badge/powered%20by-SuperPlane-7fe2b4?style=flat-square)](https://superplane.com)
[![Deploy on Render](https://img.shields.io/badge/deploy-Render-46E3B7?style=flat-square&logo=render)](https://render.com)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue?style=flat-square)](https://modelcontextprotocol.io)

*Your AI coding agent reads the spec, writes the code, deploys a live preview,*
*opens a PR — all visible live in SuperPlane cloud.*

**Built at SuperPlane Hackathon: Bash Script Funeral /w Render · NYC, June 27 2026**

[npm →](https://www.npmjs.com/package/software-factory) · [GitHub →](https://github.com/hongchengw/superplane-render-nyc-hack) · [Quick Start ↓](#-quick-start)

</div>

---

## What it does

Paste a GitHub URL into any AI agent. The Software Factory MCP tools handle the rest — automatically routing everything through **SuperPlane cloud** so you can watch every stage live:

```
You:       "Use software-factory tools to build: https://github.com/you/myapp/issues/42"

Pipeline:  fetch_github_spec   → reads issue, auto-triggers SuperPlane pipeline
           [SuperPlane cloud]  → requirement-agent: Claude writes spec + Mermaid diagram
           [SuperPlane cloud]  → implementation-agent: Claude writes code, pushes branch
           [SuperPlane cloud]  → validation-agent: npm test / lint / build
           [SuperPlane cloud]  → render-deploy: live on Render in ~20s
           [SuperPlane cloud]  → pr-agent: opens PR + posts preview comment

You get:   🚀 https://factory-myapp.onrender.com
           🔀 https://github.com/you/myapp/pull/42
           🌐 https://app.superplane.com/canvases/<id>
```

**No extra AI key needed in your agent.** Software Factory is the infrastructure layer — SuperPlane + Render + GitHub, wired as 10 MCP tools that auto-orchestrate everything.

---

## 🚀 Quick Start

```bash
npx software-factory init
```

Three prompts, then MCP is auto-registered in Claude Code, Codex, and OpenCode.

```bash
npx software-factory doctor   # verify all connections
```

---

## 📐 How It Works

### End-to-End Flow

[![Workflow Diagram](https://mermaid.ink/img/Zmxvd2NoYXJ0IExSCiAgICBBKFsiWW91IGdpdmUgYSBHaXRIdWIgVVJMIl0pIC0tPiBCWyJmZXRjaF9naXRodWJfc3BlYyJdCiAgICBCIC0tPiBDWyJTdXBlclBsYW5lIHBpcGVsaW5lIHRyaWdnZXJzIl0KICAgIEMgLS0-IERbInJlcXVpcmVtZW50LWFnZW50OiBDbGF1ZGUgd3JpdGVzIHNwZWMiXQogICAgRCAtLT4gRVsiaW1wbGVtZW50YXRpb24tYWdlbnQ6IENsYXVkZSB3cml0ZXMgY29kZSJdCiAgICBFIC0tPiBGWyJyZW5kZXItZGVwbG95OiBSZW5kZXIgbGl2ZSBpbiAyMHMiXQogICAgRiAtLT4gRyhbIlByZXZpZXcgKyBQUiArIENhbnZhcyBVUkxzIl0p)](https://github.com/hongchengw/superplane-render-nyc-hack)

> 💡 **GitHub users:** The diagrams below also render interactively as native Mermaid.

```mermaid
flowchart LR
    A(["You give a GitHub URL"]) --> B["fetch_github_spec"]
    B --> C["SuperPlane pipeline triggers"]
    C --> D["requirement-agent: Claude writes spec"]
    D --> E["implementation-agent: Claude writes code"]
    E --> F["render-deploy: Render live in 20s"]
    F --> G(["🚀 Preview + 🔀 PR + 🌐 Canvas URLs"])
```

---

### Full Architecture

[![Architecture Diagram](https://mermaid.ink/img/Z3JhcGggVEIKICAgIFVbIllvdSDigJQgR2l0SHViIFVSTCJdIC0tPiBNWyJzb2Z0d2FyZS1mYWN0b3J5IE1DUCJdCiAgICBNIC0tPiB8ImF1dG8tdHJpZ2dlcnMifCBTUFsiU3VwZXJQbGFuZSBDbG91ZCBDYW52YXMiXQogICAgU1AgLS0-IEZJWyJmZXRjaC1pc3N1ZSJdCiAgICBGSSAtLT4gUkFbInJlcXVpcmVtZW50LWFnZW50IChDbGF1ZGUpIl0KICAgIFJBIC0tPiBJQVsiaW1wbGVtZW50YXRpb24tYWdlbnQgKENsYXVkZSkiXQogICAgSUEgLS0-IFZBWyJ2YWxpZGF0aW9uLWFnZW50Il0KICAgIFZBIC0tPiBSRFsicmVuZGVyLWRlcGxveSJdCiAgICBSRCAtLT4gUEFbInByLWFnZW50Il0KICAgIFJEIC0tPiBSMVsiUmVuZGVyIFByZXZpZXcgVVJMIl0KICAgIFBBIC0tPiBSMlsiR2l0SHViIFBSIl0KICAgIFBBIC0tPiBSM1siU3VwZXJQbGFuZSBDYW52YXMiXQ)](https://github.com/hongchengw/superplane-render-nyc-hack)

```mermaid
graph TB
    U["You — GitHub URL"] --> M["software-factory MCP"]
    M --> |"auto-triggers"| SP["SuperPlane Cloud Canvas"]
    SP --> FI["fetch-issue"]
    FI --> RA["requirement-agent (Claude)"]
    RA --> IA["implementation-agent (Claude)"]
    IA --> VA["validation-agent"]
    VA --> RD["render-deploy"]
    RD --> PA["pr-agent"]
    RD --> R1["🚀 Render Preview URL"]
    PA --> R2["🔀 GitHub PR"]
    PA --> R3["🌐 SuperPlane Canvas"]
```

---

### Pipeline Stages

[![Pipeline State Diagram](https://mermaid.ink/img/c3RhdGVEaWFncmFtLXYyCiAgICBbKl0gLS0-IFRyaWdnZXJlZCA6IGZhY3RvcnkgYnVpbGQgb3IgZmV0Y2hfZ2l0aHViX3NwZWMKICAgIFRyaWdnZXJlZCAtLT4gRmV0Y2hJc3N1ZSA6IFN1cGVyUGxhbmUgc3RhcnRzCiAgICBGZXRjaElzc3VlIC0tPiBSZXF1aXJlbWVudEFnZW50IDogaXNzdWUgcmVhZAogICAgUmVxdWlyZW1lbnRBZ2VudCAtLT4gSW1wbGVtZW50YXRpb25BZ2VudCA6IHNwZWMgZ2VuZXJhdGVkCiAgICBJbXBsZW1lbnRhdGlvbkFnZW50IC0tPiBWYWxpZGF0aW9uQWdlbnQgOiBjb2RlIHB1c2hlZAogICAgVmFsaWRhdGlvbkFnZW50IC0tPiBSZW5kZXJEZXBsb3kgOiB0ZXN0cyBwYXNzZWQKICAgIFJlbmRlckRlcGxveSAtLT4gUFJBZ2VudCA6IGRlcGxveWVkIGxpdmUKICAgIFBSQWdlbnQgLS0-IFsqXSA6IFByZXZpZXcgKyBQUiArIENhbnZhcyBVUkxz)](https://github.com/hongchengw/superplane-render-nyc-hack)

```mermaid
stateDiagram-v2
    [*] --> Triggered : factory build or fetch_github_spec
    Triggered --> FetchIssue : SuperPlane starts
    FetchIssue --> RequirementAgent : issue read
    RequirementAgent --> ImplementationAgent : spec generated
    ImplementationAgent --> ValidationAgent : code pushed
    ValidationAgent --> RenderDeploy : tests passed
    RenderDeploy --> PRAgent : deployed live
    PRAgent --> [*] : Preview + PR + Canvas URLs
```

Live terminal output when following a build:

```
⟳ fetch-issue          running...
✔ fetch-issue          3s
⟳ requirement-agent    running...  (Claude writing spec + Mermaid diagram)
✔ requirement-agent    44s
⟳ implementation-agent running...  (Claude writing code + pushing branch)
✔ implementation-agent 2m 18s
⟳ render-deploy        running...
✔ render-deploy        24s
✔ pr-agent             8s

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  PIPELINE COMPLETE — Share these links:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🚀  Preview:    https://factory-myapp.onrender.com
  🔀  PR:         https://github.com/owner/repo/pull/42
  🌐  SuperPlane: https://app.superplane.com/canvases/<id>
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✔ Done in 4m 37s
```

---

## 🔌 SuperPlane & Render — Integration Details

### 🌌 SuperPlane: Orchestration Engine

SuperPlane is the **brain** of the factory — it runs the entire pipeline in cloud-hosted, dockerised environments:

| What SuperPlane does | Details |
|---|---|
| **Visual Canvas** | Watch every stage run live in the UI — no black box |
| **Agent Orchestration** | Connects Claude Sonnet to bash runners for spec, code, validation |
| **Secret Vault** | Encrypts GitHub Token, Render key, Anthropic key org-wide |
| **Canvas Auto-Sync** | `factory init` always updates the remote canvas to the latest spec |
| **Event Triggering** | `fetch_github_spec` → auto-fires pipeline; visible immediately in canvas |

### ⚡ Render: Instant Preview Hosting

Render provides **zero-config, always-on preview environments**:

| What Render does | Details |
|---|---|
| **Auto-Provisioning** | First build for a repo → creates `factory-{repo}` static site automatically |
| **Fast Redeploys** | Repeat builds update branch + redeploy in ~20s |
| **PR Previews** | Each PR gets its own `factory-{repo}-pr-{N}.onrender.com` URL |
| **Root Mapping** | Serves `poc/public/` — isolated from the rest of your source |
| **URL Feedback** | Preview URL is returned to SuperPlane, embedded in PR body + issue comment |

---

## 🛠 Setup (One Time)

### Step 1 — Install & configure

```bash
npx software-factory init
```

You'll be asked for **3 things**:

| # | What | Where to get it |
|---|------|-----------------|
| 1 | **SuperPlane API token** | [app.superplane.com](https://app.superplane.com) → Profile → API Tokens |
| 2 | **GitHub personal access token** | [github.com](https://github.com) → Settings → Developer → PATs (`repo` scope) |
| 3 | **Render API key** | [dashboard.render.com/u/settings](https://dashboard.render.com/u/settings) → API Keys |

> **No Anthropic key needed in your agent** — keys live in SuperPlane's vault and are injected into pipeline nodes automatically.

After entering keys, init automatically:
- Stores all secrets encrypted in SuperPlane
- Creates (or refreshes) the pipeline canvas in SuperPlane
- Registers `software-factory` in **Claude Code** (`claude mcp add software-factory`)
- Writes `~/.mcp.json` for **Codex / OpenCode / any MCP agent**

### Step 2 — Verify

```bash
npx software-factory doctor
```

```
🏥 Software Factory Doctor

  ✔ SuperPlane API    Connected as you
  ✔ Factory Canvas    "software-factory" (a414dc62…)
     🌐 https://app.superplane.com/canvases/a414dc62-...
  ✔ GitHub Token      @yourgithub
  ✔ Render API Key    Render API reachable
  ✔ anthropic-api-key stored
  ✔ github-token      stored
  ✔ render-api-key    stored

  ✅ All systems operational! End-to-end workflow:

  1. Give the agent a GitHub issue/repo URL
  2. fetch_github_spec → auto-triggers SuperPlane pipeline
  3. SuperPlane runs: spec → code → deploy → PR (all visible in cloud)
  4. get_pipeline_status → poll until complete
  5. Report 🚀 Preview URL + 🔀 PR URL + 🌐 Canvas URL to user
```

---

## 🤖 Using with Your AI Agent

Open Claude Code, Codex, or OpenCode (MCP is already registered). Paste this:

```
Use the software-factory tools to build and deploy this:
https://github.com/owner/repo/issues/42
```

The URL can be:

| URL type | Example | What happens |
|----------|---------|--------------|
| **Issue** | `https://github.com/you/myapp/issues/42` | Reads issue → auto-triggers pipeline |
| **Repo** | `https://github.com/you/myapp` | Reads `SPEC.md` / `README.md` → triggers pipeline |
| **File** | `https://github.com/you/myapp/blob/main/SPEC.md` | Reads that file → triggers pipeline |

The agent always gets back **three links** when the pipeline finishes:

```
🚀 Preview:    https://factory-xyz.onrender.com
🔀 PR:         https://github.com/owner/repo/pull/42
🌐 SuperPlane: https://app.superplane.com/canvases/<canvas-id>
```

---

## 🛠 MCP Tools Reference

| Tool | What it does | SuperPlane visible? |
|------|-------------|---------------------|
| `factory_doctor` | Verify all connections + show canvas URL | — |
| `fetch_github_spec` | Read spec/issue **+ auto-trigger pipeline** | ✅ triggers all 6 stages |
| `trigger_autonomous_pipeline` | Explicitly trigger full pipeline | ✅ all 6 stages |
| `get_pipeline_status` | Poll progress — returns all 3 URLs when done | ✅ live stage data |
| `get_repo_structure` | List files in a GitHub repo | — |
| `read_repo_file` | Read a specific GitHub file | — |
| `push_branch` | Push code to a new branch (manual fallback) | — |
| `deploy_preview` | Deploy to Render → live HTTPS URL (manual fallback) | — |
| `get_deploy_status` | Poll a specific Render deploy | — |
| `create_pr` | Open PR + comment preview URL on issue (manual fallback) | — |

---

## 📋 CLI Reference

```bash
# Setup
npx software-factory init              # One-time setup: keys, canvas, MCP registration
npx software-factory doctor            # Verify all connections

# Run the pipeline
npx software-factory build <url>       # Trigger autonomous pipeline
npx software-factory build <url> --follow  # With live stage-by-stage output

# Monitor
npx software-factory status            # Current pipeline run status
npx software-factory status --watch    # Auto-refresh every 10s
npx software-factory logs              # Per-stage execution logs

# MCP server (called by your agent automatically)
npx software-factory mcp
```

---

## 🤝 Agent Setup Details

### Claude Code

```bash
# Auto-registered by factory init, or manually:
claude mcp add software-factory -- npx software-factory mcp
```

### Codex / OpenCode / Any MCP Agent

`~/.mcp.json` (written automatically by `factory init`):

```json
{
  "mcpServers": {
    "software-factory": {
      "command": "npx",
      "args": ["software-factory", "mcp"]
    }
  }
}
```

---

## 🔑 Environment Variables

```bash
export SUPERPLANE_TOKEN="TuovNZZl..."      # SuperPlane API token
export GITHUB_TOKEN="ghp_..."             # GitHub personal access token
export RENDER_API_KEY="rnd_..."           # Render API key
export RENDER_SERVICE_ID="srv-..."        # Optional: skip service lookup
export FACTORY_TARGET_REPO="owner/repo"  # Default target repo
export FACTORY_CANVAS_ID="uuid"          # SuperPlane canvas ID
```

Non-interactive (CI/CD):
```bash
npx software-factory init --yes
```

---

## 📁 Codebase

```
bin/
  factory.js          CLI entrypoint

src/
  mcp/
    server.js         10 MCP tools (JSON-RPC 2.0 stdio)
  commands/
    init.js           setup + MCP auto-register + canvas sync
    doctor.js         health checks
    build.js          autonomous pipeline trigger + --follow watcher
    status.js         pipeline status
    logs.js           execution logs
  superplane/
    client.js         SuperPlane REST client
    canvas-template.js  6-node pipeline definition
  config.js           ~/.factory/config.json
```

---

## 🌟 Demo — Try It Now

```bash
# Build a feature from a real SuperPlane issue
npx software-factory build https://github.com/superplanehq/superplane/issues/5368 --follow

# Watch all 6 stages complete in your terminal
# Then open the 3 links: Preview · PR · SuperPlane Canvas
```

---

## 🤝 Contributing

```bash
git clone https://github.com/hongchengw/superplane-render-nyc-hack
cd superplane-render-nyc-hack
npm install
node bin/factory.js --help
```

---

<div align="center">

Built with [SuperPlane](https://superplane.com) · Deployed on [Render](https://render.com)

MIT © [Roshan Sharma](https://github.com/roshaninfordham), [Hong Cheng Wang](https://github.com/hongchengw), [Berton Yeh](https://github.com/berber54)

</div>
