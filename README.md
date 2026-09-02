# KI-Zeitung — Unbestechliche Tageslage (Browserbasiert, MVP)

**EU-Politik + Beziehungen zu USA & China** — mit 4 genialen Tricks gegen parteiliche Presse:

1. **Perspektiven-Matrix** — gleiche Story in 7 Narrativen nebeneinander (CH-neutral, Nicht-EU Ausland, Osteuropa Grenze, RU-kritisch/Exil, RU-staatlich, UA-kritisch, IL/IR gefiltert)
2. **Auslassungs-Detektor** — was berichtet Gruppe X *nicht*?
3. **Zahlen-Anker** — jede These muss Eurostat/ECB/Bruegel/ACLED/UNHCR bestehen, verlinkt + datiert
4. **Diskurs-Tracker v2** — Begriffswanderung ("Invasion"/"Spezialoperation") — vorbereitet

Plus: **Eigentümer-Badge** (DDVG/SPD, Springer, Scott Trust...), **STAATLICH**-Label + Gewichtung (kein False Balance), **Foren-Thermometer** (Sensor, nicht Quelle, UNVERIFIZIERT), **täglicher Audit-Report**, **Zero Tracking**, **PWA offline**.

## Schnellstart (Doppelklick)

```bash
# 1) Öffnen
open ki-zeitung/index.html        # oder Doppelklick im Explorer
# 2) Offline-PWA testen
# 3) Zahlen live prüfen → Button oben rechts (braucht CH-Proxy für echten Live-Fetch)
```

## Architektur — wie gegrillt entschieden

- **Hybrid PWA** (Q3=C): Frontend browserbasiert, Crawler/Cache/KI via leichtem Backend (CH-Proxy). Pure Client scheitert an CORS.
- **LLM lokal souverän** (Q9=B): **Qwen2.5-14B Q4_K_M** auf **RTX 4070 Super 12GB** primär, Groq Free nur Fallback. Kein US-API-Lock-in.
- **Rechtssicher** (Q10=D, Q15=B): MVP nur RSS + Exil-Quellen (Meduza, Novaya, Iran Intl). Paywalls (NZZ/FT/NYT) via Lizenz/BYOK. CH-Proxy nur nach Gutachten für Staatsdomains.
- **Kostenfrei für Leser** (Q11=A, Q13): Genossenschaft/Stiftung + Spenden, Bootstrap <30€/Monat (RSS-only). Kein Abo-Zwang.
- **Sprachen** (Q2=B): DE/EN MVP, FR später. Tageslage **06:00 MEZ** + Breaking nur bei Schwelle (Q8=B).

## Quellenkorb MVP (15+4)

`data/sources.json` — 19 konfiguriert, 15 aktiv:

- CH: NZZ, SRF, Watson | UK/US: Guardian (Scott Trust), FT (Nikkei), NYT (Familie) | Osteuropa: Wyborcza (PL), Delfi (Baltikum), Helsingin Sanomat (FI), HotNews (RO)
- RU: Meduza + Novaya Gazeta **Exil-kritisch**, Kommersant **STAATLICH-NAH** (Usmanow) — rot, geringer gewichtet
- UA: Ukrainska Pravda, Kyiv Independent (Crowdfund)
- IL/IR gefiltert (nur bei EU-Bezug, Q7=A): Haaretz, Times of Israel, Iran International (Exil), Tasnim **STAATLICH** (IRGC)

IL/IR-Erweiterung wie gewünscht drin, aber strikt gefiltert.

## Lokal vs Cloud — für Rechner ohne GPU (dein Fall)

**Befund 01.09.: Ollama läuft bereits im WSL** mit `qwen2.5:14b-instruct-q4_K_M` (9GB) auf CPU — langsam (2-3 tok/s) aber funktional. Windows-Browser erreicht WSL via `localhost:11434` (mirrored) oder `172.31.125.96:11434`.

```bash
# WSL-Brücke (falls nötig)
bash backend/wsl-bridge.sh          # startet 0.0.0.0 + zieht 7B falls nötig
OLLAMA_HOST=0.0.0.0 ollama serve    # manuell, falls Windows localhost nicht geht

# Test aus Windows-Browser:
http://localhost:11434/api/tags
http://172.31.125.96:11434/api/tags   # WSL-IP (bei dir)
```

**Ohne GPU → Cloud-Fallback empfohlen (schnell, gratis):**
1. Zeitung öffnen → Kachel `LLM & CH-Proxy` → `Cloud-Fallback` aufklappen
2. Groq Key holen (free, ohne Kreditkarte): https://console.groq.com/keys → `gsk_...` einfügen → `Speichern` → `Cloud testen`
3. `☁️ Tageslage mit Cloud neu synthetisieren` klicken — Ergebnis erscheint oben
4. Alternativ: `HF Token` (huggingface.co/settings/tokens) oder `OpenRouter` free

Key bleibt nur im `localStorage` des Browsers (Zero Tracking). Ohne Key läuft die Zeitung komplett mit `data/mock.json` weiter — kein LLM-Zwang.

```bash
# Text-Browser im WSL (wenn Windows-GUI blockiert):
sudo apt install w3m -y
w3m /mnt/c/Users/o.janich/ki-zeitung/index.html
# oder mit Server:
cd /mnt/c/Users/o.janich/ki-zeitung && python3 -m http.server 8000
# WSL: w3m http://localhost:8000   | Windows: http://localhost:8000
```

Lokal mit GPU (RTX 4070S): `ollama pull qwen2.5:14b-instruct-q4_K_M` + `backend/ollama-synthese.sh`. Fallbacks: `qwen3:8b`, `mistral-nemo 12B`, `llama-3.1-8b`.

## CH-Proxy

```bash
node backend/ch-proxy.js        # http://localhost:8787
# Aufruf: /rss?url=https%3A%2F%2Fmeduza.io%2Frss2%2Fall
curl "http://localhost:8787/health"
```

Erlaubte Hosts whitelisted, 15min Cache, CORS offen, X-CH-Proxy Header. Für echten Live-Fetch `assets/js/app.js` → URL auf `/rss?url=` umbiegen.

## Zahlen-Anker Live

Endpoints in `data/numbers.json` + Fallback `data/mock.json`. Echte Zahlen kommen von Eurostat (prc_hicp), ECB, Bruegel Gas, ACLED, UNHCR, SCI Iran, TankerTrackers. Jeder Wert mit Quelle+Datum+Link, plausibel-Flag. Button "Zahlen live prüfen" nutzt CH-Proxy, sonst Fallback.

## Projekt-Struktur

```
ki-zeitung/
  index.html          # PWA, Tageslage, Synthese+Hover, Matrix, Zahlen, Audit
  manifest.json sw.js # offline
  data/sources.json   # 19 Quellen + Eigentümer
  data/mock.json      # Tageslage 01.09.2026 + 8 Zahlen + Foren + Audit
  data/numbers.json   # Live Endpoints
  assets/js/app.js    # Rendering + Provenienz + Tabs + Live-Fetch
  backend/ch-proxy.js # CH-Proxy (Node, whitelisted)
  backend/ollama-synthese.sh
```

## Nächste Schritte (V2)

- Diskurs-Tracker: Begriffswanderung pro Gruppe loggen
- Vollarchiv + BYOK für Paywalls
- Echter Crawler 05:00 Cron → Ollama Synthese → `data/mock.json` überschreiben
- Rechtsgutachten CH-Proxy + Verein/Genossenschaft gründen

— Built grill-konform, Abstriche wie empfohlen akzeptiert.
