#!/usr/bin/env bash
# One-line installer for PowerSoftware Agent Skills.
#
# Usage:
#   bash <(curl -sL https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.sh)
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

REPO_URL="https://github.com/mizhanchengxi/powersoftware-agent-skills.git"
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

echo "→ cloning $REPO_URL"
git clone --depth 1 "$REPO_URL" "$TMP" >/dev/null 2>&1

SRC="$TMP/skills/$SKILL"
if [ ! -d "$SRC" ]; then
  echo "error: skill '$SKILL' not found under skills/" >&2
  echo "available skills:" >&2
  ls -1 "$TMP/skills" >&2
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
