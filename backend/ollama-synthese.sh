#!/usr/bin/env bash
# Lokal Qwen2.5-14B Synthese — RTX 4070 Super 12GB, Q4_K_M
# 1) ollama pull qwen2.5:14b-instruct-q4_K_M  (oder qwen2.5:14b-instruct-q4_K_M via Modelfile)
# 2) ./backend/ollama-synthese.sh
set -e
MODEL="qwen2.5:14b-instruct-q4_K_M"
# Fallback falls Tag nicht existiert:
if ! ollama list | grep -q "qwen2.5"; then
  echo "Model $MODEL nicht gefunden, pull qwen2.5:14b ..."
  ollama pull qwen2.5:14b || ollama pull qwen2.5:7b-instruct
  MODEL="qwen2.5:14b"
fi
PROMPT=$(cat <<'PROMPT'
Du bist KI-Zeitung Synthese. Erzeuge Tageslage 06:00 MEZ aus 7 Perspektiven.
Regeln: 1) Jeder Absatz max 2 Sätze. 2) Markiere Widersprüche explizit. 3) Füge Zahlenanker [eurostat_inflation, ecb_rate, bruegel_gas, acled_ua] inline ein. 4) Staatsmedien (kommersant, tasnim) nur als STAATLICH gelabelte Gegendarstellung, nicht in Konsens.
Input: data/mock.json + RSS via CH-Proxy.
Output: JSON array wie in data/mock.json -> tageslage.synthese
PROMPT
)
echo "Rufe $MODEL ..."
curl -s http://localhost:11434/api/generate -d "{\"model\":\"$MODEL\",\"prompt\":$(echo "$PROMPT" | jq -Rs .),\"stream\":false}" | jq -r .response > /tmp/synthese.json
echo "→ /tmp/synthese.json"
cat /tmp/synthese.json | head -c 2000
