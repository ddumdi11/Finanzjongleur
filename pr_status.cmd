@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\pr_status.ps1" %*
pause