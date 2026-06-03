@echo off
REM hopper-cursor Windows wrapper — delegates to the bash script
REM Anchor: hosts/cursor-cli/bin/hopper-cursor.cmd

bash "%~dp0hopper-cursor" %*
