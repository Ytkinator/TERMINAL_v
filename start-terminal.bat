@echo off
chcp 65001 >nul 2>&1
title Terminal VG

echo [1/7] Closing Chrome...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath taskkill.exe -ArgumentList '/F','/T','/IM','chrome.exe' -WindowStyle Hidden -PassThru; if (-not $p.WaitForExit(5000)) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping -n 3 127.0.0.1 >nul

echo [2/7] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo       Python not found. Downloading...
    set "PY_URL=https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe"
    set "PY_EXE=%TEMP%\python_install.exe"
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile($env:PY_URL, $env:PY_EXE)"
    echo       Installing Python...
    "%TEMP%\python_install.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1
    ping -n 11 127.0.0.1 >nul
    set "PATH=%PATH%;C:\Program Files\Python312;C:\Program Files\Python312\Scripts"
    echo       Done.
)

echo [3/7] Installing print libraries...
python -m pip install --quiet pywin32 Pillow PyMuPDF >nul 2>&1

echo [4/7] Setting silent print policy...
REG ADD "HKLM\SOFTWARE\Policies\Google\Chrome" /v SilentPrintingEnabled /t REG_DWORD /d 1 /f >nul 2>&1
REG ADD "HKCU\SOFTWARE\Policies\Google\Chrome" /v SilentPrintingEnabled /t REG_DWORD /d 1 /f >nul 2>&1
REG ADD "HKLM\SOFTWARE\Policies\Google\Chrome" /v PrintPreviewUseSystemDefaultPrinter /t REG_DWORD /d 1 /f >nul 2>&1
REG ADD "HKCU\SOFTWARE\Policies\Google\Chrome" /v PrintPreviewUseSystemDefaultPrinter /t REG_DWORD /d 1 /f >nul 2>&1

echo [5/7] Starting server (port 9999)...
cd /d "%~dp0"
start /b "" python server.py
ping -n 4 127.0.0.1 >nul

echo [6/7] Starting payment service (port 5050)...
start /b "" python payment_service.py
ping -n 4 127.0.0.1 >nul

echo [7/7] Launching Chrome kiosk...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\TerminalVG" --kiosk --kiosk-printing --disable-session-crashed-bubble --noerrdialogs --disable-infobars --disable-features=TranslateUI --disable-background-mode --disable-pinch --overscroll-history-navigation=0 http://localhost:9999

echo.
echo === Terminal started ===
if exist "%~dp0VERSION" (
    set /p TERMINAL_VERSION=<"%~dp0VERSION"
    echo Version:        %TERMINAL_VERSION%
)
echo Server:         localhost:9999 (print + API proxy)
echo Payment service: localhost:5050 (PAX S300 via DualConnector)
echo Exit kiosk: Alt+F4
pause
