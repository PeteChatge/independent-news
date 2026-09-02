#!/usr/bin/env bash
# KI-Zeitung start.sh - WSL (bash ./start.sh)
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "=== KI-Zeitung Start (WSL) ==="
export OLLAMA_ORIGINS="*"
export OLLAMA_HOST="0.0.0.0"

if ! command -v ollama >/dev/null 2>&1; then
  echo "!! ollama nicht gefunden - https://ollama.com/install.sh"
  echo "   curl -fsSL https://ollama.com/install.sh | sh"
  echo "   Ohne Ollama: Zeitung laeuft trotzdem via Mock + Cloud (Groq)"
else
  if ! pgrep -x ollama >/dev/null 2>&1; then
    echo "Starte ollama serve..."
    nohup ollama serve > /tmp/ollama.log 2>&1 &
    sleep 3
  else
    echo "Ollama laeuft bereits (PID $(pgrep -x ollama | head -1))"
  fi
  if ! ollama list 2>/dev/null | grep -q qwen; then
    echo "Ziehe qwen2.5:7b (CPU, 4.5GB)..."
    ollama pull qwen2.5:7b || ollama pull qwen2.5:7b-instruct || true
  else
    echo "Modell vorhanden:"
    ollama list | grep qwen || ollama list | head
  fi
fi

# HTTP Server fuer Windows-Browser + w3m
cd "$DIR"
if lsof -i :8000 >/dev/null 2>&1; then
  echo "Port 8000 belegt - nutze bestehenden Server"
else
  echo "Starte http://localhost:8000 ..."
  nohup python3 -m http.server 8000 > /tmp/ki-http.log 2>&1 &
  sleep 1
fi

echo ""
echo "Offen:"
echo "  Windows: http://localhost:8000  oder Doppelklick index.html"
echo "  WSL:     w3m http://localhost:8000  oder w3m $DIR/index.html"
echo "  Test:    curl http://localhost:11434/api/tags | head"
echo ""
if command -v w3m >/dev/null 2>&1; then
  echo "w3m gefunden - starte? (j/n) [n]"
  read -t 5 ans || ans="n"
  if [[ "$ans" == "j"* ]]; then w3m http://localhost:8000; fi
fi
