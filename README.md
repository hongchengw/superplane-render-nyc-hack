<div align="center">

# 🏭 Software Factory

**Give it a GitHub issue or repo. Get a deployed PoC.**

[![npm version](https://img.shields.io/npm/v/software-factory?style=flat-square&color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/software-factory)
[![npm downloads](https://img.shields.io/npm/dm/software-factory?style=flat-square&color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/software-factory)
[![GitHub stars](https://img.shields.io/github/stars/hongchengw/superplane-render-nyc-hack?style=flat-square&logo=github)](https://github.com/hongchengw/superplane-render-nyc-hack/stargazers)
[![GitHub license](https://img.shields.io/github/license/hongchengw/superplane-render-nyc-hack?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Powered by SuperPlane](https://img.shields.io/badge/powered%20by-SuperPlane-7fe2b4?style=flat-square)](https://superplane.com)
[![Deploy on Render](https://img.shields.io/badge/deploy-Render-46E3B7?style=flat-square&logo=render&logoColor=white)](https://render.com)

*Your AI coding agent implements the issue. Software Factory deploys it to Render and opens the PR.*

Built at **SuperPlane Hackathon: Bash Script Funeral /w Render** · NYC, June 27 2026

[**npm →**](https://www.npmjs.com/package/software-factory) · [**Demo issues ↓**](#demo-issues)

</div>

---

## What It Does

```
You:     "Implement https://github.com/superplanehq/superplane/issues/5368"

Agent:   fetch_github_issue  → reads the issue
         get_repo_structure  → understands the codebase
         ✍️  writes the implementation (agent's own AI)
         push_branch         → pushes code to GitHub
         deploy_preview      → deploys to Render, returns live URL
         create_pr           → opens PR + comments preview URL on issue

Result:  🚀 Preview: https://factory-issue-5368.onrender.com
         🔀 PR: https://github.com/superplanehq/superplane/pull/999
```

**The AI agent you're already using does the code.** Software Factory handles GitHub, Render, and SuperPlane — no Anthropic key required.

---

## Install

```bash
npm install -g software-factory
# or use directly:
npx software-factory
```

---

## Setup (One Time)

```bash
npx software-factory init
```

You'll be asked for 3 things:

| # | What | Where |
|---|------|-------|
| 1 | **SuperPlane API token** | [app.superplane.com](https://app.superplane.com) → Profile → API Tokens |
| 2 | **GitHub personal access token** | [github.com](https://github.com) → Settings → Developer settings → PATs (`repo` scope) |
| 3 | **Render API key** | [dashboard.render.com/u/settings](https://dashboard.render.com/u/settings) → API Keys |

> **No Anthropic key needed.** Your AI agent (Claude Code, Codex, OpenCode) is already the AI — software-factory is the infrastructure layer.

Or use environment variables for non-interactive setup:
```bash
export SUPERPLANE_TOKEN="TuovNZZl..."
export GITHUB_TOKEN="ghp_..."
export RENDER_API_KEY="rnd_..."

npx software-factory init --yes
```

---

## Using with Your AI Agent

### Claude Code

```bash
# Register as MCP server (one time)
claude mcp add software-factory -- npx software-factory mcp
```

Then in any Claude Code session:
```
Use software-factory MCP tools to implement this issue and deploy it:
https://github.com/superplanehq/superplane/issues/5368

Steps:
1. factory_doctor — verify setup
2. fetch_github_issue — read the issue
3. get_repo_structure — understand the codebase
4. [implement the changes using your own tools]
5. push_branch — push your implementation
6. deploy_preview — get a live Render URL
7. create_pr — open PR + comment the preview URL on the issue
```

### Codex / OpenCode / Any MCP Agent

Add to your agent's MCP config (`.mcp.json` or agent settings):
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

Then ask your agent:
```
Use the software-factory tools to build and deploy a PoC for:
https://github.com/superplanehq/superplane/issues/5368
```

---

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `factory_doctor` | Check setup: SuperPlane, GitHub, Render all connected |
| `fetch_github_issue` | Read issue title, body, labels, comments |
| `get_repo_structure` | List files in a GitHub repo (any path, any branch) |
| `read_repo_file` | Read a specific file from GitHub |
| `push_branch` | Push code files to a new GitHub branch |
| `deploy_preview` | Deploy branch to Render → returns live HTTPS URL |
| `get_deploy_status` | Poll a Render deployment for live status |
| `create_pr` | Open PR + comment preview URL on the original issue |
| `get_pipeline_status` | Check SuperPlane canvas run history |
| `trigger_autonomous_pipeline` | Run the full autonomous pipeline (no agent needed) |

---

## Agent Workflow

```mermaid
sequenceDiagram
    participant User
    participant Agent as AI Agent<br/>(Claude Code / Codex)
    participant MCP as Software Factory<br/>(MCP Tools)
    participant SP as SuperPlane
    participant GH as GitHub
    participant RE as Render

    User->>Agent: "Implement issue #5368 and deploy"

    Agent->>MCP: fetch_github_issue(issue_url)
    MCP->>GH: GET /repos/superplanehq/superplane/issues/5368
    GH-->>Agent: Issue title, body, labels

    Agent->>MCP: get_repo_structure(repo, path)
    MCP->>GH: GET /repos/.../contents/
    GH-->>Agent: File tree

    Note over Agent: Agent reads relevant files,<br/>writes the implementation

    Agent->>MCP: push_branch(repo, branch, files)
    MCP->>GH: Create commit + branch
    GH-->>Agent: Branch URL

    Agent->>MCP: deploy_preview(repo, branch)
    MCP->>RE: Create/update service, trigger deploy
    RE-->>Agent: 🚀 https://xxx.onrender.com

    Agent->>MCP: create_pr(repo, branch, preview_url)
    MCP->>GH: POST /pulls + POST /issues/5368/comments
    GH-->>Agent: PR URL

    Agent->>User: Preview: https://xxx.onrender.com<br/>PR: https://github.com/.../pull/999
```

---

## CLI Commands

```bash
factory init [--yes]          # One-time setup
factory doctor                # Check configuration
factory build <url> [--follow] # Autonomous pipeline (no agent needed)
factory status [--watch]       # Live pipeline status
factory logs                   # Per-stage execution logs
factory mcp                    # Start MCP server for AI agents
```

### `factory build --follow` (Autonomous Mode)

If you want the pipeline to run fully automatically without an AI agent session:

```bash
factory build https://github.com/superplanehq/superplane/issues/5368 --follow
```

This triggers the SuperPlane canvas which autonomously: fetches the issue → generates spec → writes code → deploys → opens PR. Requires an Anthropic API key stored in secrets (set during `factory init`).

```mermaid
flowchart LR
    A([🚀 Start]) -->|issue_url\nrepo| B
    B["📋 Fetch Issue\nGitHub API"]
    B -->|passed| C
    C["🧠 Requirement Agent\nGenerates spec"]
    C -->|passed| D
    D["⚙️ Implementation\nWrites + pushes code"]
    D -->|passed| E
    E["✅ Validation\nnpm test / build"]
    E -->|passed| F
    F["🚢 Deploy\nRender preview"]
    F -->|passed| G
    G["🔀 PR Agent\nPR + issue comment"]

    style A fill:#7fe2b4,stroke:#333,color:#000
    style G fill:#46E3B7,stroke:#333,color:#000
```

---

## Architecture

```mermaid
graph TB
    subgraph agents["👤 AI Agents (already on your machine)"]
        cc["Claude Code"]
        cx["Codex"]
        oc["OpenCode"]
        any["Any MCP agent"]
    end

    subgraph factory["🏭 Software Factory (npm package)"]
        mcp["MCP Server\nfactory mcp"]
        cli["CLI\nfactory build"]
    end

    subgraph infra["☁️ Infrastructure"]
        sp["SuperPlane\norchestration + state"]
        gh["GitHub API\nfetch · push · PR"]
        re["Render API\ndeploy · preview URL"]
    end

    cc & cx & oc & any -->|"MCP tools"| mcp
    cli -->|"trigger_autonomous"| sp
    mcp --> gh
    mcp --> re
    mcp --> sp
    sp --> gh
    sp --> re

    style agents fill:#1a1a2e,color:#eee,stroke:#7fe2b4
    style factory fill:#16213e,color:#eee,stroke:#46E3B7
    style infra fill:#0f3460,color:#eee,stroke:#7fe2b4
```

---

## Demo Issues

The factory was built to solve these 5 SuperPlane open source issues:

```bash
# In your AI agent:
# "Use software-factory MCP tools to implement and deploy:"

factory build https://github.com/superplanehq/superplane/issues/5368 --follow   # Markdown + Mermaid
factory build https://github.com/superplanehq/superplane/issues/5366 --follow   # Canvas version diff
factory build https://github.com/superplanehq/superplane/issues/5164 --follow   # Send execution to chat
factory build https://github.com/superplanehq/superplane/issues/5704 --follow   # Run inspection UX
factory build https://github.com/superplanehq/superplane/issues/5705 --follow   # Canvas warnings
```

---

## Codebase

```mermaid
graph LR
    subgraph bin["bin/"]
        fjs["factory.js\nCLI entrypoint"]
    end
    subgraph src["src/"]
        subgraph mcp["mcp/"]
            ms["server.js\n10 MCP tools\nfetch · push · deploy · PR"]
        end
        subgraph commands["commands/"]
            ci["init.js\nsetup wizard"]
            cd["doctor.js\nhealth checks"]
            cb["build.js\nautonomous trigger + follow"]
            cs["status.js\nlive status"]
            cl["logs.js\nexecution logs"]
        end
        subgraph sp["superplane/"]
            client["client.js\nREST client"]
            tmpl["canvas-template.js\n7-node pipeline"]
        end
        cfg["config.js\n~/.factory/config.json"]
    end

    fjs --> ci & cd & cb & cs & cl & ms
    ms --> client & cfg
    ci --> tmpl & client & cfg

    style bin fill:#2d2d2d,color:#eee,stroke:#7fe2b4
    style src fill:#1a1a2e,color:#eee,stroke:#46E3B7
```

---

## Contributing

```bash
git clone https://github.com/hongchengw/superplane-render-nyc-hack
cd superplane-render-nyc-hack
npm install
node bin/factory.js --help
```

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=hongchengw/superplane-render-nyc-hack&type=Date)](https://star-history.com/#hongchengw/superplane-render-nyc-hack&Date)

</div>

---

## License

MIT © [Roshan Sharma](https://github.com/hongchengw)

---

<div align="center">

Built with [SuperPlane](https://superplane.com) · Deployed on [Render](https://render.com)

</div>
