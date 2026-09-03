@echo off
setlocal
REM KI-Zeitung start.bat - Windows (Doppelklick)
REM Setzt CORS frei, startet Ollama, oeffnet Zeitung

echo === KI-Zeitung Start (Windows) ===

REM CORS fuer Browser freigeben
set OLLAMA_ORIGINS=*
set OLLAMA_HOST=0.0.0.0

REM Ollama pruefen
where ollama >nul 2>&1
if %errorlevel% neq 0 (
  echo !! ollama nicht gefunden - installiere von https://ollama.com
  echo    Ohne Ollama laeuft Zeitung trotzdem via Mock + Cloud (Groq)
  goto OPEN
)

REM Laeuft schon?
tasklist | findstr /I "ollama" >nul 2>&1
if %errorlevel% neq 0 (
  echo Starte ollama serve...
  start /B ollama serve > "%~dp0ollama.log" 2>&1
  timeout /t 4 >nul
) else (
  echo Ollama laeuft bereits.
)

REM Modell pruefen (7B CPU, 14B nur mit GPU)
ollama list | findstr /I "qwen" >nul 2>&1
if %errorlevel% neq 0 (
  echo Ziehe qwen2.5:7b (CPU-tauglich, 4.5GB)...
  ollama pull qwen2.5:7b
) else (
  echo Modell vorhanden:
  ollama list
)

:OPEN
echo.
echo Oeffne Zeitung...
REM HTTP via Python optional, aber file:// reicht (PWA via file geht)
start "" "%~dp0index.html"
echo.
echo Fertig. In Zeitung: "Lokal testen" klicken.
echo Wenn CORS Fehler: OLLAMA_ORIGINS=* gesetzt? ollama serve neu starten.
echo Fuer Video/PNG: Browser muss html2canvas laden (online).
echo.
pause
