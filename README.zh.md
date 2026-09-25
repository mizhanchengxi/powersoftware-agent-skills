# PowerSoftware Agent Skills

<p align="center">
  <b>🌐 语言 / Language</b> &nbsp;·&nbsp; <a href="./README.zh.md">中文</a> &nbsp;|&nbsp; <a href="./README.md">English</a>
</p>

面向 [PowerSoftware（幂栈网）](https://www.powersoftware.app) 软件分发平台的一系列 [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)，用于把日常反复发生的运营/发布动作交给 AI 编码助手自动完成。

Skill 就是一份纯 Markdown 剧本（可搭配脚本），告诉 AI Agent *怎么做*一件事。遵循通用的 `SKILL.md` 格式，可直接在 Qoder、Claude Code 以及任何兼容 MCP/Skill 的 Agent 中使用。

## 🤖 让 AI 编码助手帮你自动安装（推荐）

把下面这段提示词复制后粘贴给 Qoder / Claude Code（或任何支持 Skill 的 Agent）。Agent 会自行识别操作系统与网络、执行安装脚本并回报结果——你不需要手敲任何命令：

```text
请帮我安装 PowerSoftware Agent Skills。

1. 目标 skills 目录：
   - Qoder 个人级：~/.qoder-cn/skills
   - Claude Code：   ~/.claude/skills
   （如果不确定自己属于哪个 Agent，先问我。）
2. 两个 skill 都装：publish-license-product 和 integrate-license。
3. 获取安装脚本。安装脚本自身已经内置“Gitee 优先、不通回退 GitHub”。最可靠的方式
   （尤其在中国大陆）是先克隆仓库再本地执行，两个镜像任选：
   - Gitee 镜像（中国大陆推荐）：
       git clone https://gitee.com/powersoftware-app/powersoftware-agent-skills
   - GitHub（权威源）：
       git clone https://github.com/powersoftware-app/powersoftware-agent-skills.git
   进入克隆目录后执行安装脚本：
   - macOS / Linux / WSL：  cd powersoftware-agent-skills && bash install.sh <目标目录> <skill名>
   - Windows PowerShell：   cd powersoftware-agent-skills; .\install.ps1 -Target <目标目录> -Skill <skill名>
   也可不克隆，直接用一行式远程安装（需 raw 域名可达）：
   - Gitee：  bash <(curl -sL https://gitee.com/powersoftware-app/powersoftware-agent-skills/raw/main/install.sh)
   - GitHub： bash <(curl -sL https://raw.githubusercontent.com/powersoftware-app/powersoftware-agent-skills/main/install.sh)
   - Gitee：  iwr -useb https://gitee.com/powersoftware-app/powersoftware-agent-skills/raw/main/install.ps1 | iex
   - GitHub： iwr -useb https://raw.githubusercontent.com/powersoftware-app/powersoftware-agent-skills/main/install.ps1 | iex
4. 前置依赖：PATH 里有 git，并装了 Node.js 18+（脚本运行需要）；缺失请先安装。
5. 完成后，列出已安装的 skill 目录以确认，并把每个 skill 的“Next steps”展示给我。
```

## 一行命令安装

**macOS / Linux / WSL**

```bash
bash <(curl -sL https://raw.githubusercontent.com/powersoftware-app/powersoftware-agent-skills/main/install.sh)
```

**Windows PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/powersoftware-app/powersoftware-agent-skills/main/install.ps1 | iex
```

默认装到 **Qoder 个人 skills 目录**（`~/.qoder-cn/skills`）。可以传目标关键字（`qoder` / `claude`）或显式路径 + skill 名字，安装到其它位置：

```bash
bash install.sh claude <skill-name>
bash install.sh /path/to/your-repo/.qoder/skills <skill-name>
```

`<skill-name>` 可填 `publish-license-product` 或 `integrate-license`。

> GitHub 访问不畅？仓库在 Gitee 有镜像，可克隆后本地执行安装脚本：
> `git clone https://gitee.com/powersoftware-app/powersoftware-agent-skills && cd powersoftware-agent-skills && bash install.sh`。

## 作为 Claude Code 插件安装（marketplace）

本仓库已通过 [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) 注册为 **Claude Code Plugin Marketplace**。在 Claude Code 里执行：

```
/plugin marketplace add powersoftware-app/powersoftware-agent-skills
/plugin install publish-license-product@powersoftware-agent-skills
/plugin install integrate-license@powersoftware-agent-skills
```

安装后，直接在对话里提到这个 skill 的名字即可——Claude Code 会按需动态加载。

## Skill 列表

| Skill | 作用 |
|-------|------|
| [`publish-license-product`](skills/publish-license-product/SKILL.md) | 端到端剧本：在 PowerSoftware 上**发布一个支持授权码的软件产品**——注册用户 → 申请合作伙伴（**含强制人工审核闸门**）→ 上传封面/详情图与安装包 → 提交产品审核。附带零依赖 Node 脚本。 |
| [`integrate-license`](skills/integrate-license/SKILL.md) | 剧本：用官方零依赖 SDK（Node / Python / Java）把**客户端软件接入 PowerSoftware 授权体系**——选择接入场景、运行时从 GitHub 拉取最新 SDK、实现机器码/试用/激活/版本门控/购买页跳转，并对接入做冒烟自检。附带零依赖 Node 脚本。 |

> 不想手动拷文件？已额外提供 Qoder 原生插件包，分别位于 [`plugin/publish-license-product/`](plugin/publish-license-product/README.md) 与 [`plugin/integrate-license/`](plugin/integrate-license/README.md)——直接把整个目录放进 Qoder 插件目录或项目的 plugin manifest 即可。

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

## 快速上手（integrate-license）

```bash
cd skills/integrate-license/scripts
node fetch-sdk.mjs --lang node --dest ../../<你的项目>/vendor   # 拉取最新 SDK 源码
node smoke.mjs --product <productUniqueCode> \
  --sdk ../../<你的项目>/vendor/powersoftware-license-sdk/node/src/index.js
# 然后按 SKILL.md 第 3~5 步把 试用/verifyCached/激活 接入你的应用
```

## 安全说明

- `config.local.json`、`.ps-session.json` 以及 `assets/` 目录下的所有内容都已被 gitignore 屏蔽——**切勿提交账号密码或会话 cookie**。
- 合作伙伴申请**必须由平台运营人工审核**，本 Skill 会在闸门处停下，不能也**不应**绕过这一步。

## License

MIT
