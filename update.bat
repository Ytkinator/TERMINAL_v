@echo off
chcp 65001 >nul 2>&1
title Terminal VG - Update
cd /d "%~dp0"

echo.
echo  ========================================
echo    Terminal VG - Update
echo  ========================================
echo.

set "REPO_ZIP_URL=https://codeload.github.com/Ytkinator/TERMINAL_v/zip/refs/heads/master"
set "REPO_ZIP_ROOT=TERMINAL_v-master"
set "REPO_ZIP=%TEMP%\terminal_vg_update.zip"
set "REPO_DIR=%TEMP%\terminal_vg_update_ext"
set "ENV_BACKUP=%TEMP%\terminal_vg_env_backup_%RANDOM%.env"
set "COPY_LOG=%TEMP%\terminal_vg_update_copy_%RANDOM%.log"

echo  Source: %REPO_ZIP_URL%
echo.

echo  [1/5] Downloading update archive...
if exist "%REPO_ZIP%" del /q "%REPO_ZIP%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%REPO_ZIP_URL%' -OutFile '%REPO_ZIP%' -UseBasicParsing"
if %errorlevel% neq 0 goto :update_fail
if not exist "%REPO_ZIP%" goto :update_fail

echo  [2/5] Extracting archive...
if exist "%REPO_DIR%" rmdir /s /q "%REPO_DIR%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Expand-Archive -Path '%REPO_ZIP%' -DestinationPath '%REPO_DIR%' -Force"
if %errorlevel% neq 0 goto :update_fail
if not exist "%REPO_DIR%\%REPO_ZIP_ROOT%\" goto :update_fail

echo  [3/5] Preserving local config...
if exist "%~dp0.env" copy /y "%~dp0.env" "%ENV_BACKUP%" >nul 2>&1

echo  [4/5] Copying files...
robocopy "%REPO_DIR%\%REPO_ZIP_ROOT%" "%~dp0" /E /R:2 /W:1 /XF ".env" /XD ".git" "__pycache__" > "%COPY_LOG%"
set "COPY_EXIT=%errorlevel%"
if %COPY_EXIT% geq 8 goto :copy_fail
if exist "%ENV_BACKUP%" copy /y "%ENV_BACKUP%" "%~dp0.env" >nul 2>&1

echo  [5/5] Checking runtime...
python --version >nul 2>&1
if %errorlevel% equ 0 goto :python_ok

echo  [!] Python not found. Installing...
set "PY_EXE=%TEMP%\python_install.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe' -OutFile '%PY_EXE%' -UseBasicParsing"
if not exist "%PY_EXE%" goto :python_fail
"%PY_EXE%" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1
timeout /t 10 /nobreak >nul
set "PATH=%PATH%;C:\Program Files\Python312;C:\Program Files\Python312\Scripts"
del /q "%PY_EXE%" >nul 2>&1

:python_ok
echo  [OK] Python found.
python -m pip install --quiet pywin32 Pillow PyMuPDF >nul 2>&1
echo  [OK] Libraries ready.
goto :done

:python_fail
echo  [!] Python install failed.
goto :cleanup

:copy_fail
echo.
echo  [!] Copy failed. Robocopy exit code: %COPY_EXIT%
echo      Last copy log lines:
if exist "%COPY_LOG%" powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Path '%COPY_LOG%' -Tail 40"
goto :cleanup

:update_fail
echo.
echo  [!] Update failed.
echo      Check internet connection and that the public GitHub repository is available.
echo      URL: %REPO_ZIP_URL%
goto :cleanup

:done
echo.
echo  ========================================
echo    Update completed.
echo  ========================================
echo.
echo  Restart start-terminal.bat to run the new version.

:cleanup
if exist "%ENV_BACKUP%" del /q "%ENV_BACKUP%" >nul 2>&1
if exist "%REPO_ZIP%" del /q "%REPO_ZIP%" >nul 2>&1
if exist "%REPO_DIR%" rmdir /s /q "%REPO_DIR%" >nul 2>&1
if exist "%COPY_LOG%" del /q "%COPY_LOG%" >nul 2>&1
echo.
pause
