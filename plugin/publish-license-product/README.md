# PowerSoftware Publish License Product — Qoder Plugin

Qoder-native plugin that packages the **`publish-license-product`** Agent Skill. It teaches an AI coding agent how to publish a license-enabled software product end-to-end on [PowerSoftware](https://www.powersoftware.app) / [幂栈网](https://www.powersoftware.cn).

## What this plugin does

Given a target product spec (JSON), the skill guides the agent through:

1. **User registration** on PowerSoftware (email verification code).
2. **Partner application** with a **mandatory human review gate** — the platform only injects the `DEVELOPER` role at login when the operator approves (`auditStatus === PASS`), so the skill pauses here and cannot bypass it.
3. **Re-login** to pick up the newly granted `DEVELOPER` role.
4. **Asset upload** — cover image, 3–20 detail images, and installer/archive; each goes through `checkFileExists → getPreSignedUrl → PUT` and returns the `objectName` used inside the product payload.
5. **Product submission** to `/product/submit`, with strict schema validation for `TRIAL_FIRST` vs `PAY_FIRST` sales models and edition price ordering.

Ships with dependency-free Node 18+ scripts — **no `npm install` needed**.

## Provenance

- **Source repo**: [mizhanchengxi/powersoftware-agent-skills](https://github.com/mizhanchengxi/powersoftware-agent-skills)
- **Source skill directory**: [`skills/publish-license-product/`](https://github.com/mizhanchengxi/powersoftware-agent-skills/tree/main/skills/publish-license-product)
- **Upstream release**: [v1.0.0](https://github.com/mizhanchengxi/powersoftware-agent-skills/releases/tag/v1.0.0)
- **Logo**: `assets/avatar.svg` — original artwork created for this plugin (keyhole + upload arrow, PowerSoftware brand colors). No third-party asset reused.

## Included

```text
publish-license-product/
├── .qoder-plugin/plugin.json
├── README.md
├── assets/avatar.svg
└── skills/publish-license-product/
    ├── SKILL.md
    ├── reference.md
    ├── scripts/
    │   ├── lib.mjs
    │   ├── register.mjs
    │   ├── login.mjs
    │   ├── apply-partner.mjs
    │   ├── publish.mjs
    │   └── config.example.json
    └── templates/
        ├── partner.example.json
        └── product.license.example.json
```

Nothing from the source skill was omitted.

## Install

**Option A — one-line installer from the source repo (recommended):**

```bash
# macOS / Linux / WSL
bash <(curl -sL https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.sh) qoder publish-license-product
```

```powershell
# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.ps1 | iex
```

**Option B — drop this plugin folder into a Qoder project:**

Copy the entire `publish-license-product/` (this folder) into your Qoder plugin directory or reference it in your project's plugin manifest; Qoder reads `.qoder-plugin/plugin.json` at the plugin root.

## Setup the skill needs

Before first use, edit `skills/publish-license-product/scripts/config.local.json` (copied from `config.example.json`):

```json
{
  "baseUrl": "https://www.powersoftware.cn/frontApi",
  "email": "you@example.com",
  "password": "your-password"
}
```

- `baseUrl` defaults to the CN site — it has no Cloudflare Turnstile on login/registration, so scripted flows work.
- For the overseas prod site (`https://www.powersoftware.app/frontApi`), Turnstile is enforced on login — run the first login interactively in a browser, then reuse the session, or use the CN site for automation.
- `config.local.json` and `.ps-session.json` are gitignored. **Never commit credentials or session cookies.**

## Human-review gate (by design)

The partner application step **cannot** be automated past human approval. The `apply-partner.mjs` script:

1. Submits your partner profile via `/developer/save`.
2. Prints a large `⛔ HUMAN GATE` block telling you to wait for an operator.
3. Requires you to re-run `login.mjs` after approval to pick up the `DEVELOPER` role before `publish.mjs` will succeed.

This mirrors the platform's real security model — the skill intentionally does not try to bypass it.

## Validation

- `.qoder-plugin/plugin.json` declares only components that exist (`skills: "./skills/"`, `logo: "./assets/avatar.svg"`).
- Skill frontmatter contains non-empty `name` and `description`.
- All Node scripts pass `node --check` (verified in upstream repo before packaging).
- No `.DS_Store`, `__MACOSX/`, `settings.local.json`, or non-Qoder manifest directories are shipped.

## License

MIT (inherited from the upstream repo).
