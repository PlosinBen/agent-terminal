#!/usr/bin/env bash
# Agent Terminal installer
# Usage: curl -fsSL https://raw.githubusercontent.com/PlosinBen/agent-terminal/main/install.sh | bash -s -- [full|server]
set -euo pipefail

GITHUB_OWNER="PlosinBen"
GITHUB_REPO="agent-terminal"
INSTALL_MODE="${1:-full}"

# Detect platform and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="darwin" ;;
  Linux)  PLATFORM="linux" ;;
  *) echo "Error: Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64)       ARCH_TAG="x64" ;;
  arm64|aarch64) ARCH_TAG="arm64" ;;
  *) echo "Error: Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Fetch latest release tag
echo "Fetching latest release..."
LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null) || {
  echo "Error: Failed to fetch latest release. Check your network connection."
  exit 1
}

VERSION="${LATEST_TAG#v}"
echo "Installing Agent Terminal ${LATEST_TAG} (${INSTALL_MODE} mode, ${PLATFORM}/${ARCH_TAG})"
echo ""

install_full() {
  if [ "$PLATFORM" = "darwin" ]; then
    ASSET="Agent-Terminal-${VERSION}-${ARCH_TAG}.dmg"
    URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${LATEST_TAG}/${ASSET}"
    TMP_DIR="$(mktemp -d)"
    TMP_DMG="${TMP_DIR}/agent-terminal.dmg"

    echo "Downloading ${ASSET}..."
    curl -fsSL -o "$TMP_DMG" "$URL"

    echo "Installing to /Applications..."
    hdiutil attach "$TMP_DMG" -mountpoint /Volumes/AgentTerminal -quiet
    rm -rf "/Applications/Agent Terminal.app"
    cp -R "/Volumes/AgentTerminal/Agent Terminal.app" /Applications/
    hdiutil detach /Volumes/AgentTerminal -quiet
    rm -rf "$TMP_DIR"

    echo ""
    echo "Installed: /Applications/Agent Terminal.app"
    echo ""
    echo "NOTE: macOS will block unsigned apps on first launch."
    echo "Fix with:  xattr -cr \"/Applications/Agent Terminal.app\""
    echo "Or: Right-click the app > Open > Open"

  elif [ "$PLATFORM" = "linux" ]; then
    ASSET="Agent-Terminal-${VERSION}-${ARCH_TAG}.AppImage"
    URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${LATEST_TAG}/${ASSET}"
    INSTALL_DIR="$HOME/.local/bin"
    INSTALL_PATH="${INSTALL_DIR}/agent-terminal"

    mkdir -p "$INSTALL_DIR"
    echo "Downloading ${ASSET}..."
    curl -fsSL -o "$INSTALL_PATH" "$URL"
    chmod +x "$INSTALL_PATH"

    echo ""
    echo "Installed: ${INSTALL_PATH}"
    echo "Make sure ~/.local/bin is in your PATH."
  fi
}

install_server() {
  # Check node is available
  if ! command -v node &>/dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js >= 18."
    exit 1
  fi

  NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
  if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "Error: Node.js >= 18 required (found $(node --version))."
    exit 1
  fi

  ASSET="agent-terminal-server-${VERSION}-${PLATFORM}-${ARCH_TAG}.tar.gz"
  URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${LATEST_TAG}/${ASSET}"
  INSTALL_DIR="${HOME}/.local/agent-terminal-server"
  BIN_DIR="${HOME}/.local/bin"
  BIN_PATH="${BIN_DIR}/agent-terminal-server"

  echo "Downloading ${ASSET}..."
  TMP_TAR="$(mktemp).tar.gz"
  curl -fsSL -o "$TMP_TAR" "$URL"

  # Clean previous install
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  mkdir -p "$BIN_DIR"

  tar -xzf "$TMP_TAR" -C "$INSTALL_DIR" --strip-components=1
  rm "$TMP_TAR"

  # Symlink bin
  ln -sf "$INSTALL_DIR/bin/agent-terminal-server" "$BIN_PATH"

  echo ""
  echo "Installed: ${INSTALL_DIR}"
  echo "Binary:   ${BIN_PATH}"
  echo ""
  echo "Run:  agent-terminal-server"
  echo "Then open http://localhost:9100 in your browser."
  echo ""
  echo "Make sure ~/.local/bin is in your PATH."
}

case "$INSTALL_MODE" in
  full)   install_full ;;
  server) install_server ;;
  *)
    echo "Usage: curl -fsSL https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/install.sh | bash -s -- [full|server]"
    echo ""
    echo "  full   — Electron desktop app (default)"
    echo "  server — Headless server (requires Node.js >= 18)"
    exit 1
    ;;
esac

echo ""
echo "Done."
