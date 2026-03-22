#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_NAME="html-slides"

echo "HTML Slides Installer"
echo "====================="
echo "Repo: $REPO_DIR"
echo ""

# Agent Skills standard: symlink into ~/.agents/skills/
AGENTS_DIR="$HOME/.agents/skills"
SKILL_LINK="$AGENTS_DIR/$SKILL_NAME"

mkdir -p "$AGENTS_DIR"

if [ -e "$SKILL_LINK" ]; then
  echo "Already installed at $SKILL_LINK"
  # Update symlink if pointing elsewhere
  current="$(readlink "$SKILL_LINK" 2>/dev/null || true)"
  if [ "$current" != "$REPO_DIR" ]; then
    rm -f "$SKILL_LINK"
    ln -s "$REPO_DIR" "$SKILL_LINK"
    echo "Updated symlink to $REPO_DIR"
  fi
else
  ln -s "$REPO_DIR" "$SKILL_LINK"
  echo "Installed to $SKILL_LINK"
fi

echo ""
echo "This skill is now available to all agents that support the Agent Skills standard:"
echo "  - Claude Code"
echo "  - Gemini CLI"
echo "  - GitHub Copilot"
echo "  - OpenAI Codex"
echo ""
echo "Restart your agent to pick up the new skill."
