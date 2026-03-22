#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_NAME="html-slides"

echo ""
echo "  HTML Slides Installer"
echo "  ====================="
echo "  Repo: $REPO_DIR"
echo ""

# --- Detect available agents ---
agents=()
command -v claude &>/dev/null && agents+=("claude")
command -v gemini &>/dev/null && agents+=("gemini")
command -v gh &>/dev/null     && agents+=("copilot")
command -v codex &>/dev/null  && agents+=("codex")

if [ ${#agents[@]} -eq 0 ]; then
  echo "  No supported agents detected."
  echo "  You can install manually — see README.md"
  exit 0
fi

echo "  Detected: ${agents[*]}"
echo ""
echo "  Choose install scope:"
echo ""
echo "    1) User-level  — available in all projects (recommended)"
echo "    2) Project-level — available only in current project"
echo "    3) Both"
echo ""
read -rp "  Enter choice [1]: " choice
choice="${choice:-1}"

installed=0

install_skill() {
  local target_dir="$1"
  local label="$2"
  local link="$target_dir/$SKILL_NAME"

  mkdir -p "$target_dir"
  if [ -L "$link" ]; then
    current="$(readlink "$link" 2>/dev/null || true)"
    if [ "$current" = "$REPO_DIR" ]; then
      echo "  ✓ $label — already installed"
    else
      rm -f "$link"
      ln -s "$REPO_DIR" "$link"
      echo "  ✓ $label — updated symlink"
    fi
  elif [ -e "$link" ]; then
    echo "  ✗ $label — path exists but is not a symlink, skipping"
  else
    ln -s "$REPO_DIR" "$link"
    echo "  ✓ $label — installed"
  fi
  installed=$((installed + 1))
}

echo ""

# --- User-level installs ---
if [ "$choice" = "1" ] || [ "$choice" = "3" ]; then
  echo "  Installing user-level skills..."
  echo ""

  # Universal Agent Skills path
  install_skill "$HOME/.agents/skills" "~/.agents/skills (all agents)"

  # Agent-specific paths
  for agent in "${agents[@]}"; do
    case "$agent" in
      claude)
        install_skill "$HOME/.claude/skills" "~/.claude/skills (Claude Code)"
        ;;
      gemini)
        install_skill "$HOME/.gemini/skills" "~/.gemini/skills (Gemini CLI)"
        ;;
      codex)
        install_skill "$HOME/.codex/skills" "~/.codex/skills (OpenAI Codex)"
        ;;
    esac
  done

  # Claude Code plugin (optional extra)
  if [[ " ${agents[*]} " == *" claude "* ]]; then
    MARKETPLACE_DIR="$HOME/.claude/plugins/local-marketplace"
    PLUGIN_LINK="$MARKETPLACE_DIR/plugins/$SKILL_NAME"
    if [ -d "$MARKETPLACE_DIR" ]; then
      if [ ! -e "$PLUGIN_LINK" ]; then
        ln -s "$REPO_DIR" "$PLUGIN_LINK"
      fi
      claude plugin marketplace update local-plugins 2>/dev/null || true
      claude plugin update "$SKILL_NAME@local-plugins" 2>/dev/null \
        || claude plugin install "$SKILL_NAME@local-plugins" 2>/dev/null \
        || true
      echo "  ✓ Claude Code plugin installed (marketplace)"
    fi
  fi
  echo ""
fi

# --- Project-level installs ---
if [ "$choice" = "2" ] || [ "$choice" = "3" ]; then
  echo "  Installing project-level skills..."
  echo ""

  # Universal Agent Skills path
  install_skill ".agents/skills" ".agents/skills (all agents)"

  # Agent-specific paths
  for agent in "${agents[@]}"; do
    case "$agent" in
      claude)
        install_skill ".claude/skills" ".claude/skills (Claude Code)"
        ;;
      gemini)
        install_skill ".gemini/skills" ".gemini/skills (Gemini CLI)"
        ;;
      copilot)
        install_skill ".github/skills" ".github/skills (GitHub Copilot)"
        ;;
      codex)
        install_skill ".codex/skills" ".codex/skills (OpenAI Codex)"
        ;;
    esac
  done
  echo ""
fi

echo "  Done. $installed path(s) configured."
echo "  Restart your agent to pick up the new skill."
echo ""
