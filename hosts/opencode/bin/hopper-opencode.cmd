@echo off
REM hopper-opencode Windows wrapper — delegates to the bash script
REM Anchor: hosts/opencode/bin/hopper-opencode.cmd

bash "%~dp0hopper-opencode" %*
