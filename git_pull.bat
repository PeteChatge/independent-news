@echo off
REM KI-Zeitung Werkzeug: synchronisieren, zeigen, vormerken
REM Aufruf per Doppelklick aus dem Repo-Ordner heraus

git pull
echo.
echo --- Status ---
git status
echo.
git add .
echo.
echo --- Vorgemerkt. Pruefen mit: git status ---
echo Committen mit: git commit -m "Beschreibung"
echo Hochladen mit:  git push
pause