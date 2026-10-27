@echo off
cd /d "%~dp0"
if not exist out mkdir out
javac -d out src\com\pocketwise\*.java
if errorlevel 1 (
  echo Compile failed. Make sure a JDK 17 or newer is installed ^(javac -version^).
  pause
  exit /b 1
)
java -cp out com.pocketwise.Main
pause
