# PowerSoftware Agent Skills

<p align="center">
  <b>🌐 Language / 语言</b> &nbsp;·&nbsp; <a href="./README.md">English</a> &nbsp;|&nbsp; <a href="./README.zh.md">中文</a>
</p>

A collection of [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) for automating recurring operational tasks on the [PowerSoftware](https://www.powersoftware.app) software-distribution platform.

Skills are plain Markdown playbooks (+ optional scripts) that teach an AI coding agent *how* to perform a workflow. They follow the common `SKILL.md` format, so they work in Qoder, Claude Code, and any MCP/skill-compatible agent.

## One-line install

**macOS / Linux / WSL**

```bash
bash <(curl -sL https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.sh)
```

**Windows PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.ps1 | iex
```

Defaults to the **Qoder personal skills** directory (`~/.qoder-cn/skills`). Pass a target shortcut (`qoder` / `claude`) or an explicit path, plus a skill name, to install elsewhere:

```bash
bash install.sh claude publish-license-product
bash install.sh /path/to/your-repo/.qoder/skills publish-license-product
```

## Skills

| Skill | What it does |
|-------|--------------|
| [`publish-license-product`](skills/publish-license-product/SKILL.md) | End-to-end playbook to **publish a license-enabled software product** on PowerSoftware: register a user → apply as partner (with a mandatory human review gate) → upload cover/detail images & installer → submit the product for review. Ships with dependency-free Node scripts. |

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

## Security notes

- `config.local.json`, `.ps-session.json` and anything under `assets/` are git-ignored — never commit credentials or session cookies.
- The partner application requires **manual approval by platform operators**; the skill intentionally pauses and cannot (and should not) bypass that gate.

## License

MIT
