@echo off
echo.
echo === GARMIN SYNC FOR FOX ===
echo.

cd /d "C:\Users\Cindy\AI\garmin"

REM Run with uv, using Alex's fork of garminconnect
"C:\Users\Cindy\.local\bin\uv.exe" run --with "garminconnect @ git+https://github.com/cindiekinzz-coder/python-garminconnect.git" python garmin_sync.py %*

echo.
pause
