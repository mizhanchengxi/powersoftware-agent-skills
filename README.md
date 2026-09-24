# PowerSoftware Agent Skills

<p align="center">
  <b>🌐 Language / 语言</b> &nbsp;·&nbsp; <a href="./README.md">English</a> &nbsp;|&nbsp; <a href="./README.zh.md">中文</a>
</p>

A collection of [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) for automating recurring operational tasks on the [PowerSoftware](https://www.powersoftware.app) software-distribution platform.

Skills are plain Markdown playbooks (+ optional scripts) that teach an AI coding agent *how* to perform a workflow. They follow the common `SKILL.md` format, so they work in Qoder, Claude Code, and any MCP/skill-compatible agent.

## One-line install

**macOS / Linux / WSL**

```bash
bash <(curl -sL https://raw.githubusercontent.com/powersoftware-app/powersoftware-agent-skills/main/install.sh)
```

**Windows PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/powersoftware-app/powersoftware-agent-skills/main/install.ps1 | iex
```

Defaults to the **Qoder personal skills** directory (`~/.qoder-cn/skills`). Pass a target shortcut (`qoder` / `claude`) or an explicit path, plus a skill name, to install elsewhere:

```bash
bash install.sh claude <skill-name>
bash install.sh /path/to/your-repo/.qoder/skills <skill-name>
```

Replace `<skill-name>` with `publish-license-product` or `integrate-license`.

> Can't reach GitHub? The repo is mirrored on Gitee — clone it and run the installer locally:
> `git clone https://gitee.com/powersoftware-app/powersoftware-agent-skills && cd powersoftware-agent-skills && bash install.sh`.

## Install as a Claude Code plugin (marketplace)

This repo is also registered as a **Claude Code Plugin marketplace** via [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json). Inside Claude Code, run:

```
/plugin marketplace add powersoftware-app/powersoftware-agent-skills
/plugin install publish-license-product@powersoftware-agent-skills
/plugin install integrate-license@powersoftware-agent-skills
```

After install, just mention the skill by name — Claude Code loads it dynamically whenever you ask to publish a product on PowerSoftware.

## Skills

| Skill | What it does |
|-------|--------------|
| [`publish-license-product`](skills/publish-license-product/SKILL.md) | End-to-end playbook to **publish a license-enabled software product** on PowerSoftware: register a user → apply as partner (with a mandatory human review gate) → upload cover/detail images & installer → submit the product for review. Ships with dependency-free Node scripts. |
| [`integrate-license`](skills/integrate-license/SKILL.md) | Playbook to **wire a client software product into the PowerSoftware license system** with the official zero-dependency SDK (Node / Python / Java): choose the integration scenario, fetch the latest SDK from GitHub at runtime, implement machine-code / trial / activation / edition-gating / purchase-redirect, and smoke-test the wiring. Ships with dependency-free Node scripts. |

> Prefer Qoder's plugin installer instead of copying files? Qoder-native plugin packages are also published at [`plugin/publish-license-product/`](plugin/publish-license-product/README.md) and [`plugin/integrate-license/`](plugin/integrate-license/README.md) — drop the whole folder into your Qoder plugins directory or your project's plugin manifest.

## Install a skill

Pick the skills directory for your agent and copy / symlink a skill folder into it:

**Qoder**
```bash
# project scope (shared with your team via git)
cp -r skills/publish-license-product  <your-repo>/.qoder/skills/
# personal scope (all your projects)
cp -r skills/publish-license-product  ~/.qoder-cn/skills/
```

**Claude Code / generic**
```bash
cp -r skills/publish-license-product  ~/.claude/skills/
```

The `scripts/` folder needs **Node.js 18+** (uses built-in `fetch`). No `npm install` required.

## Quick start (publish-license-product)

```bash
cd skills/publish-license-product/scripts
cp config.example.json config.local.json   # fill in baseUrl / email / password
node register.mjs --send-code              # email gets a 6-digit code
node register.mjs --code 123456            # completes registration
node login.mjs                             # stores SESSION_ID cookie
node apply-partner.mjs --send-code
node apply-partner.mjs --code 123456 --profile ../templates/partner.example.json
# ⛔ wait for an operator to approve your partner application, then:
node login.mjs                             # re-login to pick up the DEVELOPER role
node publish.mjs --spec ../templates/product.license.example.json
```

## Quick start (integrate-license)

```bash
cd skills/integrate-license/scripts
node fetch-sdk.mjs --lang node --dest ../../<your-project>/vendor   # pull the latest SDK source
node smoke.mjs --product <productUniqueCode> \
  --sdk ../../<your-project>/vendor/powersoftware-license-sdk/node/src/index.js
# then follow SKILL.md Steps 3–5 to wire trial / verifyCached / activate into your app
```

## Security notes

- `config.local.json`, `.ps-session.json` and anything under `assets/` are git-ignored — never commit credentials or session cookies.
- The partner application requires **manual approval by platform operators**; the skill intentionally pauses and cannot (and should not) bypass that gate.

## License

MIT
