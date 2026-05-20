@echo off
:: Windows wrapper for hopper-dispatch (T-PLUGIN-00 Prong 3 Windows compat)
:: Invokes Node on the actual shebang script.
node "%~dp0hopper-dispatch" %*
