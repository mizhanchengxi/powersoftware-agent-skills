# PowerSoftware Integrate License — Agent Skill Plugin

Packages the **`integrate-license`** Agent Skill. It teaches an AI coding agent how to wire a
**client software product** into the [PowerSoftware](https://www.powersoftware.app) /
[幂栈网](https://www.powersoftware.cn) license system using the official zero-dependency SDK
([`powersoftware-license-sdk`](https://github.com/mizhanchengxi/powersoftware-license-sdk),
Node.js / Python / Java).

## What this plugin does

Given a project that needs licensing, the skill guides the agent through:

1. **Scenario selection** — A: platform full funnel (TRIAL_FIRST, pure client, no secret) vs.
   B: orders off-platform (your server issues codes with an HMAC `apiSecret`).
2. **Hard rules** that are easy to get wrong — `apiSecret` never ships to the client, the edition
   ladder must include `TRIAL: 99`, monthly trial quota follows the server's `trialPeriodKey`, etc.
3. **Runtime SDK fetch** — `scripts/fetch-sdk.mjs` pulls the *latest* SDK source straight from the
   GitHub API (no git, no tar, no `raw.githubusercontent.com`), keeping the SDK repo as the single
   source of truth. **No SDK code is bundled in this skill on purpose.**
4. **Code integration** — machine-code → claimTrial → verifyCached (edition gate) → activate →
   purchaseUrl → error-code UX, with a language-agnostic call-order template.
5. **Smoke test** — `scripts/smoke.mjs` verifies machine-code stability, purchase-URL shape, real
   platform connectivity (`checkUpdate`) and the SDK error envelope, before declaring done.

Ships with dependency-free Node 18+ scripts — **no `npm install` needed**.

## Provenance

- **Source repo**: [mizhanchengxi/powersoftware-agent-skills](https://github.com/mizhanchengxi/powersoftware-agent-skills)
- **Source skill directory**: [`skills/integrate-license/`](https://github.com/mizhanchengxi/powersoftware-agent-skills/tree/main/skills/integrate-license)
- **SDK repo (single source of truth for code)**: [mizhanchengxi/powersoftware-license-sdk](https://github.com/mizhanchengxi/powersoftware-license-sdk)
- **Logo**: `assets/avatar.svg` — original artwork (keyhole + code brackets, PowerSoftware brand colors). No third-party asset reused.

## Included

```text
integrate-license/
├── .claude-plugin/plugin.json
├── .qoder-plugin/plugin.json
├── README.md
├── assets/avatar.svg
└── skills/integrate-license/
    ├── SKILL.md
    ├── reference.md
    └── scripts/
        ├── fetch-sdk.mjs
        └── smoke.mjs
```

Nothing from the source skill was omitted.

## Install

**Option A — one-line installer from the source repo (recommended):**

```bash
# macOS / Linux / WSL
bash <(curl -sL https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.sh) qoder integrate-license
```

```powershell
# Windows PowerShell
.\install.ps1 -Target qoder -Skill integrate-license
```

**Option B — Claude Code marketplace:**

```
/plugin marketplace add mizhanchengxi/powersoftware-agent-skills
/plugin install integrate-license@powersoftware-agent-skills
```

**Option C — drop this plugin folder into a Qoder project:** copy the entire
`integrate-license/` folder into your Qoder plugin directory or reference it in your project's
plugin manifest; Qoder reads `.qoder-plugin/plugin.json` at the plugin root.

## Usage

```bash
cd skills/integrate-license/scripts
# 1) fetch the SDK source into your project (run from your project root, or pass --dest)
node fetch-sdk.mjs --lang node --dest ./vendor
# 2) smoke-test connectivity (no real license needed)
node smoke.mjs --product <productUniqueCode> --sdk ./vendor/powersoftware-license-sdk/node/src/index.js
```

Requires **Node.js 18+** (built-in `fetch`). `--lang` also accepts `python`, `java`, `all`.

## Security notes

- The skill never embeds your `apiSecret`; Scenario B keeps it server-side only.
- `fetch-sdk.mjs` talks to `api.github.com` over HTTPS and writes only the SDK source files.
- `smoke.mjs` issues read-only-ish probes against the platform; `claimTrial` runs only with an
  explicit `--trial` flag (it consumes the once-per-machine trial).

## Validation

- `.qoder-plugin/plugin.json` declares only components that exist (`skills: "./skills/"`, `logo: "./assets/avatar.svg"`).
- Skill frontmatter contains non-empty `name` and `description`.
- All Node scripts pass `node --check`; `fetch-sdk.mjs` and `smoke.mjs` were verified against the
  live platform before packaging.

## License

MIT (inherited from the upstream repo).
