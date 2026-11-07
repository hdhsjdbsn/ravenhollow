#!/usr/bin/env bash
# Ravenhollow — one-time installer for SteamOS (run once in Desktop Mode, in Konsole):
#   curl -fsSL https://raw.githubusercontent.com/hdhsjdbsn/ravenhollow/main/get.sh | bash
# Installs the game into ~/Games/Ravenhollow, Google Chrome (Flatpak) when no Chrome/Chromium is present,
# lets the browser see game controllers, and adds Ravenhollow with artwork to the Steam library.
# After this the game starts from Game Mode and updates itself on every start.
set -euo pipefail
REPO="hdhsjdbsn/ravenhollow"
BASE="${RH_BASE:-https://raw.githubusercontent.com/$REPO/main}"
DEST="$HOME/Games/Ravenhollow"
say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; command -v zenity >/dev/null && zenity --error --width=420 --text="$*" 2>/dev/null; exit 1; }
[ "$(id -u)" = 0 ] && fail "Run this as your normal user (deck), not with sudo."
command -v python3 >/dev/null || fail "python3 is missing (it is part of SteamOS; is this SteamOS?)"

say "1/4  Downloading Ravenhollow into $DEST"
mkdir -p "$DEST"
curl -fsSL --retry 3 -o "$DEST/rh_update.py.part" "$BASE/game/rh_update.py" || fail "Could not reach GitHub. Check the internet connection and try again."
mv "$DEST/rh_update.py.part" "$DEST/rh_update.py"
echo "$REPO" > "$DEST/repo.txt"
python3 "$DEST/rh_update.py" --install || fail "The download did not finish. Run the same command again; it continues where it stopped."
chmod +x "$DEST/ravenhollow.sh"

say "2/4  Browser"
BROWSER=""
for id in com.google.Chrome org.chromium.Chromium; do
  if flatpak info "$id" >/dev/null 2>&1; then BROWSER="$id"; break; fi
done
if [ -z "$BROWSER" ]; then
  for bin in google-chrome google-chrome-stable chromium chromium-browser; do
    command -v "$bin" >/dev/null 2>&1 && BROWSER="$bin" && break
  done
fi
if [ -z "$BROWSER" ]; then
  echo "Installing Google Chrome from Flathub (about 300 MB, only this once)…"
  flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
  flatpak install --user -y --noninteractive flathub com.google.Chrome || fail "Installing Google Chrome failed. Install it from the Discover store and run this command again."
  BROWSER=com.google.Chrome
fi
echo "Using $BROWSER"
if flatpak info "$BROWSER" >/dev/null 2>&1; then
  # without these a Flatpak browser cannot see game controllers (same fix as for Xbox Cloud Gaming)
  flatpak --user override --filesystem=/run/udev:ro --device=all "$BROWSER"
fi

say "3/4  Menu entry"
mkdir -p "$HOME/.local/share/applications"
DESK="$HOME/.local/share/applications/ravenhollow.desktop"
cat > "$DESK" <<EOF
[Desktop Entry]
Type=Application
Name=Ravenhollow
Comment=Beneath the Ashen Chapel — a gothic action RPG
Exec=$DEST/ravenhollow.sh
Icon=$DEST/art/icon.png
Terminal=false
Categories=Game;RolePlaying;
EOF
chmod +x "$DESK"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

say "4/4  Steam library"
if python3 "$DEST/rh_update.py" --has-shortcut; then
  echo "Ravenhollow is already in your Steam library."
else
  ENC=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$DESK")
  touch /tmp/addnonsteamgamefile
  if command -v steam >/dev/null 2>&1; then (steam "steam://addnonsteamgame/$ENC" >/dev/null 2>&1 &)
  else (xdg-open "steam://addnonsteamgame/$ENC" >/dev/null 2>&1 &); fi
  echo "Asked Steam to add Ravenhollow…"
fi
if python3 "$DEST/rh_update.py" --steam-art --wait 45; then
  MSG="Ravenhollow is installed and in your Steam library.\n\nSwitch back to Game Mode (Return to Gaming Mode on the desktop) and start it from Library → Non-Steam.\nIt updates itself every time it starts."
else
  MSG="Ravenhollow is installed, but Steam did not confirm the shortcut.\n\nIn Steam: Games → Add a Non-Steam Game to My Library… → tick Ravenhollow.\nThe artwork is added the first time the game starts."
fi
say "Done"; printf "%b\n" "$MSG"
command -v zenity >/dev/null && zenity --info --width=460 --title=Ravenhollow --text="$MSG" 2>/dev/null || true
