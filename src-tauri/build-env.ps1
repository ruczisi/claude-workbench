$ErrorActionPreference = "Continue"
$msvcBin = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Tools\MSVC\14.38.33128\bin\Hostx64\x64"
$env:PATH = "C:\Users\dgqlx.WIN11\.cargo\bin;" + $env:PATH
$env:HOME = "C:\Users\dgqlx.WIN11"
$env:CARGO_HOME = "C:\Users\dgqlx.WIN11\.cargo"
$env:CARGO_TARGET_DIR = "F:\claude-workbench\src-tauri\target"
$env:CC = "$msvcBin\cl.exe"
$env:CXX = "$msvcBin\cl.exe"
$env:LIB = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Tools\MSVC\14.38.33128\lib\x64;C:\Program Files\Windows Kits\10\lib\10.0.22621.0\ucrt\x64;C:\Program Files\Windows Kits\10\lib\10.0.22621.0\um\x64"
$env:INCLUDE = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Tools\MSVC\14.38.33128\include;C:\Program Files\Windows Kits\10\Include\10.0.22621.0\ucrt;C:\Program Files\Windows Kits\10\Include\10.0.22621.0\shared;C:\Program Files\Windows Kits\10\Include\10.0.22621.0\um;C:\Program Files\Windows Kits\10\Include\10.0.22621.0\winrt"

Set-Location "F:\claude-workbench\src-tauri"
Write-Host "Building with MSVC environment..."
& cargo build --release 2>&1