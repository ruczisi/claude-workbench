$ErrorActionPreference = "Continue"
$vcvars = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Auxiliary\Build\vcvarsall.bat"
$buildDir = "F:\claude-workbench"

# Add cargo to PATH first
$env:PATH = "C:\Users\dgqlx.WIN11\.cargo\bin;" + $env:PATH

# Run vcvarsall and capture the environment it sets
$cmdScript = @"
cd /d $buildDir
set CARGO_TARGET_DIR=F:\claude-workbench\src-tauri\target
call "$vcvars" x64
npm run tauri build
"@

Write-Host "Starting Tauri build with VS environment..."
cmd.exe /c $cmdScript 2>&1