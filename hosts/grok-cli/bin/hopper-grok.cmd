@echo off
REM hopper-grok Windows wrapper — delegates to the bash script
REM Anchor: hosts/grok-cli/bin/hopper-grok.cmd

bash "%~dp0hopper-grok" %*
