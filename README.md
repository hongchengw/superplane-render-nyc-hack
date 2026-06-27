# 🏭 Software Factory

> Give it a GitHub issue. Wake up to a deployed PoC.

**Software Factory** is an autonomous pipeline that takes a GitHub issue and produces a working proof-of-concept: specced, implemented, tested, reviewed, and live on Render — with zero human intervention.

Built on **[SuperPlane](https://superplane.com)** (AI workflow orchestration) + **[Render](https://render.com)** (cloud deployment).

## Install

```bash
npx software-factory init
```

## Usage

```bash
# Set up once
npx software-factory init

# Health check
npx software-factory doctor

# Start the factory
npx software-factory build https://github.com/org/repo/issues/42

# Monitor progress
npx software-factory status --watch

# View logs
npx software-factory logs
```

## What It Does

```
GitHub Issue URL
      ↓
  Fetch Issue        →  reads title, body, labels from GitHub
      ↓
  Requirement Agent  →  Claude generates a detailed implementation spec
      ↓
  Implementation     →  Claude writes the code changes to a new branch
  Agent
      ↓
  Validation Agent   →  clones repo, runs npm test / build / lint
      ↓
  Deploy to Render   →  deploys a preview environment on Render
      ↓
  PR Agent           →  creates PR + comments preview URL on the issue
```

Every stage runs in SuperPlane. Each stage validates the previous one before continuing. If validation fails, the pipeline stops and reports the error.

## Setup Requirements

You'll need:
- **SuperPlane API token** — [app.superplane.com](https://app.superplane.com)
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com)
- **GitHub personal access token** — with `repo` scope
- **Render API key** — [dashboard.render.com/u/settings](https://dashboard.render.com/u/settings)

`factory init` walks you through it interactively.

## Architecture

```
CLI (software-factory)
        │
        ▼
SuperPlane Canvas (orchestrates pipeline)
        │
   ┌────┴────────────────────┐
   │                         │
Runner: fetch-issue    Claude: requirement-agent
Runner: implementation-agent
Runner: validation-agent
Render: deploy-agent
GitHub: pr-agent
```

The CLI is just the trigger layer. SuperPlane handles the full orchestration, retries, and state management.

## Demo Issues

These are the SuperPlane GitHub issues the factory was built to solve:

- [#5368](https://github.com/superplanehq/superplane/issues/5368) — Markdown view mode (mermaid.js, mention chips)
- [#5366](https://github.com/superplanehq/superplane/issues/5366) — Canvas version diff highlighting  
- [#5164](https://github.com/superplanehq/superplane/issues/5164) — Send execution to agent chat
- [#5704](https://github.com/superplanehq/superplane/issues/5704) — Run inspection UX paper cuts
- [#5705](https://github.com/superplanehq/superplane/issues/5705) — Canvas warnings improvements

```bash
factory build https://github.com/superplanehq/superplane/issues/5368
```

## Hackathon

Built at the [SuperPlane Hackathon: Bash Script Funeral /w Render](https://superplane.com) — June 27, 2026, NYC.

**Prize tracks targeted:**
- Main prize: Best Use of AI Agents
- Partner track: Best Use of Render (Web Service + Postgres)
