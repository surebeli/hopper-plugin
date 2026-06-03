@echo off
REM hopper-copilot Windows wrapper — delegates to the bash script
REM Anchor: hosts/copilot-cli/bin/hopper-copilot.cmd

bash "%~dp0hopper-copilot" %*
