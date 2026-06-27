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

[**npm package →**](https://www.npmjs.com/package/software-factory) · [**SuperPlane canvas →**](https://app.superplane.com) · [**Demo issues ↓**](#demo-issues)

</div>

---

## Install & Run

```bash
npx software-factory init
npx software-factory build https://github.com/org/repo/issues/42
```

That's it. The factory runs overnight and wakes up with a live preview URL posted to the PR.

> **Available on npm:** [`software-factory`](https://www.npmjs.com/package/software-factory) — install globally with `npm i -g software-factory` or run one-off with `npx software-factory`.

---

## How It Works

```
you:  npx software-factory build https://github.com/org/repo/issues/42

      ╔══════════════════ SuperPlane Canvas ══════════════════╗
      ║                                                        ║
      ║  [1] Fetch Issue      → reads title, body, labels     ║
      ║  [2] Requirement Agent→ Claude writes spec.md         ║
      ║  [3] Implementation   → Claude writes code, pushes    ║
      ║  [4] Validation       → npm install → lint → test     ║
      ║  [5] Deploy to Render → preview env spun up           ║
      ║  [6] PR Agent         → PR opened + issue commented   ║
      ║                                                        ║
      ╚════════════════════════════════════════════════════════╝

      ~8 hours later, you check GitHub:

      PR:      "feat: implement issue #42 [Software Factory]"
      Preview: https://your-service.onrender.com ✅
```

Every stage validates the previous one. If tests fail, the pipeline stops and reports exactly what broke.

---

## Pipeline

```mermaid
flowchart LR
    A([🚀 Start\nTrigger]) -->|issue_url\nrepo| B

    B["📋 Fetch Issue\n─────────────\nGitHub REST API\ncurl + jq"]
    B -->|passed| C

    C["🧠 Requirement\nAgent\n─────────────\nClaude Sonnet\ngenerates spec.md"]
    C -->|passed| D

    D["⚙️ Implementation\nAgent\n─────────────\nClaude Sonnet\nwrites code\ngit push branch"]
    D -->|passed| E

    E["✅ Validation\nAgent\n─────────────\nnpm install\nlint · build\ntest"]
    E -->|passed| F

    F["🚢 Deploy to\nRender\n─────────────\nRender API\npreview env"]
    F -->|passed| G

    G["🔀 PR Agent\n─────────────\nGitHub API\nopen PR\ncomment issue"]

    style A fill:#7fe2b4,stroke:#333,color:#000
    style G fill:#46E3B7,stroke:#333,color:#000
```

---

## Architecture

```mermaid
graph TB
    subgraph cli["🖥️  CLI  (npx software-factory)"]
        direction LR
        init["factory init\n──────────\nwizard: stores\nAPI keys as\nSuperPlane secrets\ncreates canvas"]
        build["factory build\n──────────\nparses issue URL\ntriggers canvas\nreturns run ID"]
        status["factory status\n──────────\nlive run state\nper-node icons\n--watch mode"]
        logs["factory logs\n──────────\nper-stage\nexecution output"]
    end

    subgraph sp["⚡  SuperPlane Canvas  (orchestration + state + retries)"]
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
        GH["GitHub\nREST API"]
        AN["Anthropic\nClaude Sonnet"]
        RE["Render\nAPI"]
    end

    build -->|"POST /hooks/run\n{issue_url, repo}"| t
    status & logs -->|"GET /runs\n/executions"| sp

    fi <-->|"GET /repos/:owner/:repo\n/issues/:number"| GH
    ra & ia <-->|"POST /v1/messages\nclaude-sonnet-4-6"| AN
    rd <-->|"POST /v1/services\n/:id/deploys"| RE
    pa -->|"POST /pulls\nPOST /issues/:n/comments"| GH

    style cli fill:#1a1a2e,color:#fff,stroke:#7fe2b4
    style sp  fill:#16213e,color:#fff,stroke:#46E3B7
    style ext fill:#0f3460,color:#fff,stroke:#7fe2b4
```

---

## CLI Commands

```bash
npx software-factory init              # one-time setup wizard
npx software-factory doctor            # verify all prerequisites
npx software-factory build <url>       # trigger the pipeline
npx software-factory status --watch    # live status updates
npx software-factory logs              # per-stage execution output
```

### `init`

Interactive wizard that:
- Prompts for your API keys
- Stores them as **SuperPlane secrets** (encrypted, never written to disk)
- Creates the 7-node canvas on your SuperPlane account
- Saves canvas ID + metadata to `~/.factory/config.json`

### `doctor`

```
  ✔ SuperPlane API          Connected
  ✔ Factory Canvas          "software-factory" (f77c363f...)
  ✔ GitHub Token            Authenticated as @you
  ✔ Render API Key          Render API reachable
  ✔ Secret: anthropic-api-key
  ✔ Secret: github-token
  ✔ Secret: render-api-key
```

### `build <issue-url>`

Accepts any of:

```bash
factory build https://github.com/owner/repo/issues/42
factory build owner/repo#42
factory build https://github.com/owner/repo/issues/42 --repo owner/other-repo
```

### `status --watch`

```mermaid
stateDiagram-v2
    [*] --> queued : factory build
    queued --> running : runner picked up
    running --> passed : all checks green
    running --> failed : lint / test / deploy error
    passed --> [*] : PR + comment posted
    failed --> [*] : pipeline halted, logs available
```

---

## Setup Requirements

| What | Where to get it | Used by |
|------|----------------|---------|
| **SuperPlane API token** | [app.superplane.com](https://app.superplane.com) → Profile → API Tokens | `factory init` |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) | Requirement Agent, Implementation Agent |
| **GitHub PAT** | GitHub → Settings → Developer → PATs (`repo` scope) | Fetch Issue, Implementation Agent, PR Agent |
| **Render API key** | [dashboard.render.com](https://dashboard.render.com/u/settings) → API Keys | Deploy to Render |
| **Render Service ID** | Your Render dashboard → the target service | Deploy to Render |

---

## Secrets Model

```mermaid
sequenceDiagram
    participant User
    participant CLI as factory init
    participant SP as SuperPlane Secrets
    participant Canvas as Canvas Nodes

    User->>CLI: Enter ANTHROPIC_API_KEY
    CLI->>SP: POST /api/v1/secrets {name: "anthropic-api-key", value}
    SP-->>CLI: secret stored (encrypted at rest)
    CLI->>Canvas: reference via {valueSource: "secret", secret: {secret: "anthropic-api-key", key: "value"}}
    Note over Canvas: API key is injected at runtime<br/>never written to disk or logs
```

Your API keys are stored once in SuperPlane's secret store. Each runner node receives them as injected environment variables at execution time.

---

## Codebase

```mermaid
graph LR
    subgraph bin["bin/"]
        fjs["factory.js\n(CLI entrypoint\nCommander.js)"]
    end

    subgraph src["src/"]
        subgraph commands["commands/"]
            ci["init.js\n─────────\nwizard +\ncanvas setup"]
            cd["doctor.js\n─────────\nhealth checks"]
            cb["build.js\n─────────\ntrigger run"]
            cs["status.js\n─────────\nrun state"]
            cl["logs.js\n─────────\nexecution logs"]
        end

        subgraph superplane["superplane/"]
            client["client.js\n─────────\nSuperPlane\nREST client"]
            template["canvas-template.js\n─────────────────\nbuildCanvasSpec()\n7-node pipeline\ndefinition"]
        end

        config["config.js\n~/.factory/config.json"]
    end

    fjs --> ci & cd & cb & cs & cl
    ci & cd & cb & cs & cl --> client
    ci --> template
    ci --> config
    cb & cs & cl --> config

    style bin fill:#2d2d2d,color:#eee,stroke:#7fe2b4
    style src fill:#1a1a2e,color:#eee,stroke:#46E3B7
```

---

## Demo Issues

These are the SuperPlane issues the factory was designed to solve end-to-end:

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

The pipeline definition lives entirely in [`src/superplane/canvas-template.js`](src/superplane/canvas-template.js). To add a new stage:
1. Add a node object to the `nodes` array
2. Wire it with an edge in the `edges` array
3. Re-run `factory init` (or update an existing canvas via the SuperPlane API)

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

Built with [SuperPlane](https://superplane.com) · Deployed on [Render](https://render.com) · Models by [Anthropic](https://anthropic.com)

</div>
