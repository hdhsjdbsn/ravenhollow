#!/usr/bin/env bash
# Ravenhollow launcher for SteamOS / Linux.
# Serves the game folder on a private local port (so the browser may use the pictures as textures)
# and opens it fullscreen in Chrome or Chromium (Flatpak or native), with sound allowed from the start.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# self-update (installed with the one-line installer: repo.txt + rh_update.py sit next to this file)
if [ "${1:-}" != "--no-update" ] && [ -f "$DIR/rh_update.py" ] && [ -f "$DIR/repo.txt" ] && command -v python3 >/dev/null 2>&1; then
  python3 "$DIR/rh_update.py" --launch
  [ $? -eq 3 ] && exec "$DIR/ravenhollow.sh" --no-update   # the launcher itself was updated
fi
# library artwork, once Steam knows the shortcut
if [ -f "$DIR/rh_update.py" ] && [ -d "$DIR/art" ] && [ ! -f "$DIR/.steam_art_done" ]; then
  (python3 "$DIR/rh_update.py" --steam-art >/dev/null 2>&1 &)
fi
PORT=47913
FLAGS=(--kiosk --start-fullscreen --autoplay-policy=no-user-gesture-required --disable-pinch --overscroll-history-navigation=0 --enable-gpu-rasterization --ignore-gpu-blocklist --password-store=basic --no-first-run --disable-features=Translate)
SERVER=""
if command -v python3 >/dev/null 2>&1; then
  # reuse a server that is still running from an earlier start
  if ! (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; then
    # no-cache: after an update the browser must not keep old game files
    python3 -c 'import sys,functools,http.server as h
class H(h.SimpleHTTPRequestHandler):
    def end_headers(s): s.send_header("Cache-Control","no-cache"); super().end_headers()
    def log_message(s,*a): pass
h.ThreadingHTTPServer(("127.0.0.1",int(sys.argv[1])),functools.partial(H,directory=sys.argv[2])).serve_forever()' $PORT "$DIR" >/dev/null 2>&1 &
    SERVER=$!
    for i in $(seq 1 40); do (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null && break; sleep 0.1; done
  fi
  GAME="http://127.0.0.1:$PORT/index.html"
else
  # no python: open the file directly (needs the file-access flag for the textures)
  GAME="file://$DIR/index.html"; FLAGS+=(--allow-file-access-from-files)
fi
cleanup() { [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; }
trap cleanup EXIT

run_flatpak() { # $1 = flatpak app id
  local profile="$HOME/.var/app/$1/ravenhollow-profile"
  mkdir -p "$profile"
  # /run/udev + --device=all: without these a Flatpak browser cannot see any game controller
  flatpak run --filesystem="$DIR":ro --filesystem=/run/udev:ro --device=all "$1" --user-data-dir="$profile" "${FLAGS[@]}" --app="$GAME"
  exit $?
}
if command -v flatpak >/dev/null 2>&1; then
  for id in com.google.Chrome org.chromium.Chromium com.brave.Browser com.microsoft.Edge; do
    if flatpak info "$id" >/dev/null 2>&1; then run_flatpak "$id"; fi
  done
fi
for bin in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge; do
  if command -v "$bin" >/dev/null 2>&1; then
    profile="$HOME/.local/share/ravenhollow/profile"; mkdir -p "$profile"
    "$bin" --user-data-dir="$profile" "${FLAGS[@]}" --app="$GAME"
    exit $?
  fi
done
echo "Ravenhollow needs Google Chrome or Chromium. Install it from the Discover store (Desktop Mode)." >&2
command -v zenity >/dev/null && zenity --error --text="Ravenhollow needs Google Chrome or Chromium.\nInstall Google Chrome from the Discover store in Desktop Mode."
exit 1
