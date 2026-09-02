#!/usr/bin/env bash
# Scroll-Video für WhatsApp Status (9:16, H.264 HQ) via ffmpeg — installiert sich auf Nachfrage
set -e
INPUT="${1:-KI-Zeitung-*.png}"
OUTPUT="${2:-KI-Zeitung-status-30s.mp4}"
DUR="${3:-30}"
FPS=30
W=1080; H=1920
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg nicht gefunden."
  read -p "Jetzt installieren? (j/n) [j]: " ans; ans=${ans:-j}
  if [[ "$ans" == j* ]]; then
    if command -v apt >/dev/null 2>&1; then sudo apt update && sudo apt install -y ffmpeg
    elif command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y ffmpeg
    elif command -v brew >/dev/null 2>&1; then brew install ffmpeg
    elif command -v pacman >/dev/null 2>&1; then sudo pacman -S --noconfirm ffmpeg
    else echo "Bitte manuell https://ffmpeg.org installieren"; exit 1; fi
  else echo "Abgebrochen — ohne ffmpeg kein MP4."; exit 1; fi
fi
if [[ "$INPUT" == *"*"* ]]; then INPUT=$(ls -t KI-Zeitung-*.png aktuell/KI-Zeitung-*.png 2>/dev/null | head -1); fi
if [ ! -f "$INPUT" ] && [ -f "aktuell/KI-Zeitung-2026-09-01.png" ]; then INPUT="aktuell/KI-Zeitung-2026-09-01.png"; fi
if [ ! -f "$INPUT" ]; then echo "PNG nicht gefunden: $INPUT — erst Browser PNG exportieren"; exit 1; fi
echo "Input: $INPUT -> $OUTPUT (${DUR}s, ${W}x${H}, CRF 20 HQ, Handy 9:16)"
ffmpeg -y -loop 1 -i "$INPUT" -t "$DUR" -vf "scale=${W}:-1:flags=lanczos,crop=${W}:${H}:0:'(ih-${H})*t/${DUR}'" -r $FPS -c:v libx264 -pix_fmt yuv420p -profile:v high -crf 20 -preset medium -movflags +faststart "$OUTPUT"
echo "Fertig: $OUTPUT — Handy-optimiert, Schrift größer, direkt in Status posten."
