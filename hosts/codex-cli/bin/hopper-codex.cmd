@echo off
REM hopper-codex Windows wrapper — delegates to the bash script
REM Anchor: hosts/codex-cli/bin/hopper-codex.cmd

bash "%~dp0hopper-codex" %*
