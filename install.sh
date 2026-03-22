#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_PATH="$REPO_DIR/skills/html-slides/SKILL.md"
INSTRUCTION="When asked to create a presentation or slides, read and follow the instructions in $SKILL_PATH"

echo "HTML Slides Installer"
echo "====================="
echo "Repo: $REPO_DIR"
echo ""

installed=0

# --- Claude Code ---
if command -v claude &>/dev/null; then
  echo "[Claude Code] Detected"
  MARKETPLACE_DIR="$HOME/.claude/plugins/local-marketplace"
  PLUGIN_LINK="$MARKETPLACE_DIR/plugins/html-slides"

  if [ ! -d "$MARKETPLACE_DIR" ]; then
    echo "  No local marketplace found at $MARKETPLACE_DIR"
    echo "  Skipping plugin install. You can point Claude at the skill directly:"
    echo "  > Read $SKILL_PATH and follow it to create a presentation"
  else
    if [ -e "$PLUGIN_LINK" ]; then
      echo "  Plugin link already exists at $PLUGIN_LINK"
      echo "  Updating marketplace and plugin..."
    else
      echo "  Linking plugin into local marketplace..."
      ln -s "$REPO_DIR" "$PLUGIN_LINK"
    fi
    claude plugin marketplace update local-plugins
    claude plugin update html-slides@local-plugins 2>/dev/null \
      || claude plugin install html-slides@local-plugins 2>/dev/null \
      || echo "  Plugin install/update failed. You may need to restart Claude Code."
    echo "  Done. Restart Claude Code to apply."
  fi
  installed=$((installed + 1))
  echo ""
fi

# --- Gemini CLI ---
if command -v gemini &>/dev/null; then
  echo "[Gemini CLI] Detected"
  GEMINI_FILE="$HOME/GEMINI.md"

  if [ -f "$GEMINI_FILE" ] && grep -q "html-slides" "$GEMINI_FILE" 2>/dev/null; then
    echo "  Already configured in $GEMINI_FILE"
  else
    echo "" >> "$GEMINI_FILE"
    echo "$INSTRUCTION" >> "$GEMINI_FILE"
    echo "  Added instruction to $GEMINI_FILE"
  fi
  installed=$((installed + 1))
  echo ""
fi

# --- GitHub Copilot ---
COPILOT_FILE=".github/copilot-instructions.md"
if [ -d ".github" ] || command -v gh &>/dev/null; then
  echo "[GitHub Copilot] Detected"
  mkdir -p .github

  if [ -f "$COPILOT_FILE" ] && grep -q "html-slides" "$COPILOT_FILE" 2>/dev/null; then
    echo "  Already configured in $COPILOT_FILE"
  else
    echo "" >> "$COPILOT_FILE"
    echo "$INSTRUCTION" >> "$COPILOT_FILE"
    echo "  Added instruction to $COPILOT_FILE"
  fi
  installed=$((installed + 1))
  echo ""
fi

# --- OpenAI Codex ---
if command -v codex &>/dev/null; then
  echo "[OpenAI Codex] Detected"
  AGENTS_FILE="AGENTS.md"

  if [ -f "$AGENTS_FILE" ] && grep -q "html-slides" "$AGENTS_FILE" 2>/dev/null; then
    echo "  Already configured in $AGENTS_FILE"
  else
    echo "" >> "$AGENTS_FILE"
    echo "$INSTRUCTION" >> "$AGENTS_FILE"
    echo "  Added instruction to $AGENTS_FILE"
  fi
  installed=$((installed + 1))
  echo ""
fi

# --- Summary ---
if [ $installed -eq 0 ]; then
  echo "No supported agents detected (claude, gemini, gh/copilot, codex)."
  echo "You can point any AI agent at the skill entry point:"
  echo "  $SKILL_PATH"
else
  echo "Configured $installed agent(s)."
fi
