# PowerSoftware Agent Skills

<p align="center">
  <b>🌐 语言 / Language</b> &nbsp;·&nbsp; <a href="./README.zh.md">中文</a> &nbsp;|&nbsp; <a href="./README.md">English</a>
</p>

面向 [PowerSoftware（幂栈网）](https://www.powersoftware.app) 软件分发平台的一系列 [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)，用于把日常反复发生的运营/发布动作交给 AI 编码助手自动完成。

Skill 就是一份纯 Markdown 剧本（可搭配脚本），告诉 AI Agent *怎么做*一件事。遵循通用的 `SKILL.md` 格式，可直接在 Qoder、Claude Code 以及任何兼容 MCP/Skill 的 Agent 中使用。

## 一行命令安装

**macOS / Linux / WSL**

```bash
bash <(curl -sL https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.sh)
```

**Windows PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.ps1 | iex
```

默认装到 **Qoder 个人 skills 目录**（`~/.qoder-cn/skills`）。可以传目标关键字（`qoder` / `claude`）或显式路径 + skill 名字，安装到其它位置：

```bash
bash install.sh claude publish-license-product
bash install.sh /path/to/your-repo/.qoder/skills publish-license-product
```

## Skill 列表

| Skill | 作用 |
|-------|------|
| [`publish-license-product`](skills/publish-license-product/SKILL.md) | 端到端剧本：在 PowerSoftware 上**发布一个支持授权码的软件产品**——注册用户 → 申请合作伙伴（**含强制人工审核闸门**）→ 上传封面/详情图与安装包 → 提交产品审核。附带零依赖 Node 脚本。 |

> 不想手动拷文件？已额外提供 Qoder 原生插件包，位于 [`plugin/publish-license-product/`](plugin/publish-license-product/README.md)——直接把整个目录放进 Qoder 插件目录或项目的 plugin manifest 即可。

## 安装一个 Skill

选择你的 Agent 对应的 skills 目录，把 Skill 文件夹拷贝或软链进去即可：

**Qoder**
```bash
# 项目级（随仓库共享给团队）
cp -r skills/publish-license-product  <你的仓库>/.qoder/skills/
# 个人级（对你所有项目生效）
cp -r skills/publish-license-product  ~/.qoder-cn/skills/
```

**Claude Code / 通用**
```bash
cp -r skills/publish-license-product  ~/.claude/skills/
```

`scripts/` 目录需要 **Node.js 18+**（使用内置 `fetch`），**无需 `npm install`**。

## 快速上手（publish-license-product）

```bash
cd skills/publish-license-product/scripts
cp config.example.json config.local.json   # 填入 baseUrl / email / password
node register.mjs --send-code              # 邮箱收到 6 位验证码
node register.mjs --code 123456            # 完成注册
node login.mjs                             # 保存 SESSION_ID cookie
node apply-partner.mjs --send-code
node apply-partner.mjs --code 123456 --profile ../templates/partner.example.json
# ⛔ 等待平台运营审核通过你的合作伙伴申请，然后：
node login.mjs                             # 重新登录以拿到 DEVELOPER 角色
node publish.mjs --spec ../templates/product.license.example.json
```

## 安全说明

- `config.local.json`、`.ps-session.json` 以及 `assets/` 目录下的所有内容都已被 gitignore 屏蔽——**切勿提交账号密码或会话 cookie**。
- 合作伙伴申请**必须由平台运营人工审核**，本 Skill 会在闸门处停下，不能也**不应**绕过这一步。

## License

MIT
