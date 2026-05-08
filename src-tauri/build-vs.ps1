$ErrorActionPreference = "Continue"
$vcvars = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Auxiliary\Build\vcvarsall.bat"
$msvcPath = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Tools\MSVC\14.38.33128\bin\Hostx64\x64"

# Run vcvarsall and then build
$cmdScript = @"
cd /d F:\claude-workbench\src-tauri
set CARGO_TARGET_DIR=F:\claude-workbench\src-tauri\target
call "$vcvars" x64
cargo build --release
"@

Write-Host "Building with VS environment..."
cmd.exe /c $cmdScript 2>&1