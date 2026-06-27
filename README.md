<div align="center">

# 🏭 Software Factory

**Give it a GitHub issue. Wake up to a deployed PoC.**

[![npm version](https://img.shields.io/npm/v/software-factory?style=flat-square&color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/software-factory)
[![npm downloads](https://img.shields.io/npm/dm/software-factory?style=flat-square&color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/software-factory)
[![GitHub stars](https://img.shields.io/github/stars/hongchengw/superplane-render-nyc-hack?style=flat-square&logo=github)](https://github.com/hongchengw/superplane-render-nyc-hack/stargazers)
[![GitHub license](https://img.shields.io/github/license/hongchengw/superplane-render-nyc-hack?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Powered by SuperPlane](https://img.shields.io/badge/powered%20by-SuperPlane-7fe2b4?style=flat-square)](https://superplane.com)
[![Deploy on Render](https://img.shields.io/badge/deploy-Render-46E3B7?style=flat-square&logo=render&logoColor=white)](https://render.com)

*Autonomous 7-stage pipeline: fetch → spec → code → test → deploy → PR — zero human steps.*

Built at the **SuperPlane Hackathon: Bash Script Funeral /w Render** · NYC, June 27 2026

[**npm →**](https://www.npmjs.com/package/software-factory) · [**SuperPlane canvas →**](https://app.superplane.com) · [**Demo issues ↓**](#demo-issues)

</div>

---

## Quick Start

```bash
npx software-factory init
npx software-factory build https://github.com/owner/repo/issues/42
```

The pipeline runs in SuperPlane overnight. Next morning, a PR with a live Render preview URL is posted to the issue.

---

## How It Works

```
you:  npx software-factory build https://github.com/org/repo/issues/42

      ╔══════════════════ SuperPlane Canvas ══════════════════╗
      ║  [1] Fetch Issue       reads title, body, labels      ║
      ║  [2] Requirement Agent writes a precise spec.md       ║
      ║  [3] Implementation    clones repo, writes code       ║
      ║  [4] Validation        npm install → lint → test      ║
      ║  [5] Deploy to Render  preview environment live       ║
      ║  [6] PR Agent          PR opened + issue commented    ║
      ╚════════════════════════════════════════════════════════╝

      ~8 hours later:
      PR:      "feat: implement issue #42 [Software Factory]"
      Preview: https://your-service.onrender.com ✅
```

---

## Pipeline

```mermaid
flowchart LR
    A([🚀 Start\nTrigger]) -->|issue_url\nrepo| B

    B["📋 Fetch Issue\n─────────────\nGitHub REST API"]
    B -->|passed| C

    C["🧠 Requirement\nAgent\n─────────────\nGenerates spec.md"]
    C -->|passed| D

    D["⚙️ Implementation\nAgent\n─────────────\nWrites code\ngit push branch"]
    D -->|passed| E

    E["✅ Validation\nAgent\n─────────────\nnpm install\nlint · build · test"]
    E -->|passed| F

    F["🚢 Deploy to\nRender\n─────────────\nPreview env live"]
    F -->|passed| G

    G["🔀 PR Agent\n─────────────\nOpen PR\nComment issue"]

    style A fill:#7fe2b4,stroke:#333,color:#000
    style G fill:#46E3B7,stroke:#333,color:#000
```

---

## Architecture

```mermaid
graph TB
    subgraph cli["🖥️  CLI  (npx software-factory)"]
        direction LR
        init["factory init\n──────────\nStores API keys\nas SP secrets\nCreates canvas"]
        build["factory build\n──────────\nParses issue URL\nTriggers canvas"]
        status["factory status\n──────────\nLive run state\n--watch mode"]
        logs["factory logs\n──────────\nPer-stage output"]
    end

    subgraph sp["⚡  SuperPlane Canvas  (orchestration · state · retries)"]
        direction LR
        t([start])
        fi[fetch-issue]
        ra[requirement-agent]
        ia[implementation-agent]
        va[validation-agent]
        rd[render-deploy]
        pa[pr-agent]

        t -->|default| fi
        fi -->|passed| ra
        ra -->|passed| ia
        ia -->|passed| va
        va -->|passed| rd
        rd -->|passed| pa
    end

    subgraph ext["☁️  External Services"]
        GH["GitHub API"]
        AN["Anthropic API"]
        RE["Render API"]
    end

    build -->|"POST /hooks/run"| t
    status & logs -->|"GET /runs"| sp

    fi <--> GH
    ra & ia <--> AN
    rd <--> RE
    pa --> GH

    style cli fill:#1a1a2e,color:#fff,stroke:#7fe2b4
    style sp  fill:#16213e,color:#fff,stroke:#46E3B7
    style ext fill:#0f3460,color:#fff,stroke:#7fe2b4
```

---

## CLI Commands

```bash
npx software-factory init              # one-time setup wizard
npx software-factory init --yes        # non-interactive (reads env vars)
npx software-factory doctor            # verify all prerequisites
npx software-factory build <url>       # trigger the pipeline
npx software-factory status --watch    # live status updates
npx software-factory logs              # per-stage execution output
```

### `init`

Interactive wizard that:
- Prompts for your API keys (or reads from env vars)
- Stores them as **SuperPlane secrets** (encrypted, never written to disk unencrypted)
- Creates the 7-node canvas on your SuperPlane account
- Saves canvas ID to `~/.factory/config.json`

### `init --yes` (non-interactive)

Reads everything from environment variables — designed for scripted or agent-driven setup:

```bash
export SUPERPLANE_TOKEN="your-token"
export ANTHROPIC_API_KEY="sk-ant-..."
export GITHUB_TOKEN="ghp_..."
export RENDER_API_KEY="rnd_..."          # optional
export RENDER_SERVICE_ID="srv-..."       # optional
export FACTORY_TARGET_REPO="owner/repo" # defaults to superplanehq/superplane

npx software-factory init --yes
```

### `doctor`

```
  ✔ SuperPlane API          Connected as software-factory
  ✔ Factory Canvas          "software-factory" (f77c363f...)
  ✔ GitHub Token            @your-username
  ✔ Render API Key          Render API reachable
  ✔ anthropic-api-key       stored
  ✔ github-token            stored
  ✔ render-api-key          stored
```

### `build <issue-url>`

Accepts any of these formats:

```bash
factory build https://github.com/owner/repo/issues/42
factory build owner/repo#42
factory build https://github.com/owner/repo/issues/42 --repo owner/other-repo
```

---

## Using with AI Coding Agents

Software Factory is designed to be invoked by AI coding agents. Once initialized, a single command kicks off the full overnight pipeline.

### Claude Code

Paste this into your Claude Code session to solve any SuperPlane issue:

```
Use software-factory to implement this issue:
https://github.com/superplanehq/superplane/issues/5368

Steps:
1. Run `factory doctor` — if anything fails, run `factory init`
2. Run `factory build https://github.com/superplanehq/superplane/issues/5368`
3. Run `factory status` to confirm the pipeline started
```

### Codex / OpenCode / any agent

```bash
# One-line setup (if env vars are set):
npx software-factory init --yes

# Solve an issue:
npx software-factory build https://github.com/superplanehq/superplane/issues/5368

# Check progress:
npx software-factory status
```

### State machine

```mermaid
stateDiagram-v2
    [*] --> configured : factory init
    configured --> triggered : factory build
    triggered --> running : SuperPlane picks up
    running --> passed : all stages green
    running --> failed : stage error
    passed --> [*] : PR + preview URL posted to issue
    failed --> [*] : halted, logs available via factory logs
```

---

## Setup Requirements

| What | Where | Used by |
|------|-------|---------|
| **SuperPlane API token** | [app.superplane.com](https://app.superplane.com) → Profile → API Tokens | `factory init` |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) | Requirement Agent, Implementation Agent |
| **GitHub PAT** | GitHub → Settings → Developer → PATs (`repo` scope) | Fetch Issue, Implementation, PR Agent |
| **Render API key** | [dashboard.render.com](https://dashboard.render.com/u/settings) → API Keys | Deploy to Render |
| **Render Service ID** | Render dashboard → your service | Deploy to Render |

---

## Secrets Model

```mermaid
sequenceDiagram
    participant User
    participant CLI as factory init
    participant SP as SuperPlane Secrets
    participant Runner as Canvas Runner Nodes

    User->>CLI: Enter API keys
    CLI->>SP: POST /api/v1/secrets (PROVIDER_LOCAL)
    SP-->>CLI: secrets stored encrypted
    CLI->>Runner: reference via {valueSource: "secret", secret: {name, key}}
    Note over Runner: Keys injected at runtime<br/>never logged or written to disk
```

---

## Codebase

```mermaid
graph LR
    subgraph bin["bin/"]
        fjs["factory.js\nCommander CLI\nentrypoint"]
    end

    subgraph src["src/"]
        subgraph commands["commands/"]
            ci["init.js\nwizard + canvas setup\nenv var support"]
            cd["doctor.js\nhealth checks"]
            cb["build.js\ntrigger run"]
            cs["status.js\nrun state"]
            cl["logs.js\nexecution logs"]
        end

        subgraph superplane["superplane/"]
            client["client.js\nSuperPlane REST client"]
            template["canvas-template.js\nbuildCanvasSpec()\n7-node pipeline"]
        end

        config["config.js\n~/.factory/config.json"]
    end

    fjs --> ci & cd & cb & cs & cl
    ci & cd & cb & cs & cl --> client
    ci --> template
    ci & cb & cs & cl --> config

    style bin fill:#2d2d2d,color:#eee,stroke:#7fe2b4
    style src fill:#1a1a2e,color:#eee,stroke:#46E3B7
```

---

## Demo Issues

The factory was designed to solve these five SuperPlane issues end-to-end:

```bash
factory build https://github.com/superplanehq/superplane/issues/5368   # Markdown view + Mermaid
factory build https://github.com/superplanehq/superplane/issues/5366   # Canvas version diff
factory build https://github.com/superplanehq/superplane/issues/5164   # Send execution to chat
factory build https://github.com/superplanehq/superplane/issues/5704   # Run inspection UX
factory build https://github.com/superplanehq/superplane/issues/5705   # Canvas warnings
```

---

## Contributing

```bash
git clone https://github.com/hongchengw/superplane-render-nyc-hack
cd superplane-render-nyc-hack
npm install
node bin/factory.js --help
```

The pipeline definition lives in [`src/superplane/canvas-template.js`](src/superplane/canvas-template.js). To add a stage: add a node to the `nodes` array, wire it in `edges`, then re-run `factory init`.

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

Built with [SuperPlane](https://superplane.com) · Deployed on [Render](https://render.com) · Powered by [Anthropic](https://anthropic.com)

</div>
