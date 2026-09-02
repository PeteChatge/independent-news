#!/usr/bin/env bash
# WSL-Brücke für Ollama → Windows-Browser
# Problem: Windows-Browser erreicht WSL-Ollama auf localhost:11434 nicht (keine GPU, im WSL, Windows-Ollama aus)
set -e

echo "=== KI-Zeitung WSL-Brücke ==="
echo ""

# 1) Ollama auf 0.0.0.0 starten falls nicht läuft
if ! pgrep -x ollama >/dev/null; then
  echo "[1] Starte ollama serve auf 0.0.0.0 ..."
  OLLAMA_HOST=0.0.0.0 nohup ollama serve >/tmp/ollama.log 2>&1 &
  sleep 3
else
  echo "[1] Ollama läuft bereits (PID $(pgrep -x ollama))"
fi

# 2) Modell holen (7B reicht ohne GPU, 14B nur mit GPU)
if ! ollama list | grep -q "qwen2.5"; then
  echo "[2] Ziehe qwen2.5:7b (CPU-tauglich, ~4.5GB) ..."
  ollama pull qwen2.5:7b || ollama pull qwen2.5:7b-instruct
else
  echo "[2] Qwen bereits vorhanden:"
  ollama list | grep qwen
fi

# 3) IPs zeigen
echo ""
echo "[3] Teste Erreichbarkeit:"
echo "  localhost:11434 → http://localhost:11434/api/tags"
curl -s http://localhost:11434/api/tags | head -c 200 || echo "  (curl fehlgeschlagen)"
echo ""
WSL_IP=$(ip addr show eth0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
if [ -n "$WSL_IP" ]; then
  echo "  WSL-IP: $WSL_IP → http://$WSL_IP:11434/api/tags"
  echo "  Im Windows-Browser testen: http://$WSL_IP:11434/api/tags"
fi
echo "  Windows localhost sollte via WSL2-Auto-Forward gehen — falls nicht, nutze WSL-IP."

echo ""
echo "[4] Text-Browser falls Windows-GUI nicht geht:"
echo "  sudo apt install w3m lynx -y"
echo "  w3m /mnt/c/Users/o.janich/ki-zeitung/index.html"
echo "  # oder mit eigenem Server:"
echo "  cd /mnt/c/Users/o.janich/ki-zeitung && python3 -m http.server 8000"
echo "  # dann in WSL: w3m http://localhost:8000"
echo "  # und in Windows: http://localhost:8000  (gleicher Port, WSL forwarded)"

echo ""
echo "[5] Cloud-Fallback empfohlen ohne GPU:"
echo "  → Zeitung öffnen → LLM & CH-Proxy → Cloud-Fallback → Groq Key (console.groq.com/keys) einfügen → Cloud testen"
echo "  Mock-Daten laufen auch ohne LLM komplett."

echo ""
echo "Fertig. Log: tail -f /tmp/ollama.log"
