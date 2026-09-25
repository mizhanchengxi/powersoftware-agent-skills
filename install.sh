#!/usr/bin/env bash
# One-line installer for PowerSoftware Agent Skills.
#
# Usage:
#   bash <(curl -sL https://raw.githubusercontent.com/powersoftware-app/powersoftware-agent-skills/main/install.sh)
#
# In mainland China (GitHub raw unreachable), install via the Gitee mirror instead:
#   bash <(curl -sL https://gitee.com/powersoftware-app/powersoftware-agent-skills/raw/main/install.sh)
#
# Or with explicit target/skill:
#   bash install.sh <TARGET_DIR> <SKILL_NAME>
#
# Defaults:
#   TARGET_DIR = $HOME/.qoder-cn/skills
#   SKILL_NAME = publish-license-product
#
# Recognised TARGET_DIR shortcuts:
#   qoder      -> $HOME/.qoder-cn/skills    (personal scope)
#   claude     -> $HOME/.claude/skills
#   <any path> -> used as-is (e.g. your repo's .qoder/skills/)

set -euo pipefail

# 依次尝试的仓库镜像：Gitee 优先（中国大陆可达性好），不通时回退 GitHub 权威源（两者内容一致）
REPO_URLS="https://gitee.com/powersoftware-app/powersoftware-agent-skills.git https://github.com/powersoftware-app/powersoftware-agent-skills.git"
TARGET_ARG="${1:-$HOME/.qoder-cn/skills}"
SKILL="${2:-publish-license-product}"

case "$TARGET_ARG" in
  qoder)  TARGET="$HOME/.qoder-cn/skills" ;;
  claude) TARGET="$HOME/.claude/skills" ;;
  *)      TARGET="$TARGET_ARG" ;;
esac

if ! command -v git >/dev/null 2>&1; then
  echo "error: git is required but not found in PATH" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

REPO="$TMP/repo"
ERRLOG="$TMP/git_err.log"
CLONED=""
# 镜像回退：Gitee 优先，不通则回退 GitHub；每次 clone 到独立子目录，避免上次失败的残留
# 触发 git "already exists and is not an empty directory"。平时静默，全失败时打印 git 原始报错。
for url in $REPO_URLS; do
  echo "→ cloning $url"
  rm -rf "$REPO"
  if git clone --depth 1 "$url" "$REPO" >/dev/null 2>"$ERRLOG"; then
    CLONED="$REPO"
    break
  else
    echo "  clone failed, trying next mirror..." >&2
  fi
done
if [ -z "$CLONED" ]; then
  echo "error: git clone failed from all mirrors (gitee + github)" >&2
  [ -s "$ERRLOG" ] && cat "$ERRLOG" >&2
  exit 1
fi

SRC="$CLONED/skills/$SKILL"
if [ ! -d "$SRC" ]; then
  echo "error: skill '$SKILL' not found under skills/" >&2
  echo "available skills:" >&2
  ls -1 "$CLONED/skills" >&2
  exit 1
fi

mkdir -p "$TARGET"
DEST="$TARGET/$SKILL"

if [ -e "$DEST" ]; then
  BACKUP="$DEST.bak.$(date +%s)"
  echo "→ existing install found, backing up to $BACKUP"
  mv "$DEST" "$BACKUP"
fi

cp -r "$SRC" "$DEST"
echo "✔ installed '$SKILL' → $DEST"
echo
case "$SKILL" in
  integrate-license)
    echo "Next steps:"
    echo "  cd $DEST/scripts"
    echo "  node fetch-sdk.mjs --lang node --dest <your-project>/vendor   # pull the latest SDK source"
    echo "  node smoke.mjs --product <productUniqueCode>                  # verify platform connectivity"
    ;;
  *)
    echo "Next steps:"
    echo "  cd $DEST/scripts"
    echo "  cp config.example.json config.local.json   # fill in baseUrl/email/password"
    echo "  node register.mjs --send-code              # then follow the README quickstart"
    ;;
esac
