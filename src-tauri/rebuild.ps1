# Add cargo to PATH
$env:PATH = "C:\Users\dgqlx.WIN11\.cargo\bin;" + $env:PATH

# Set target dir
$env:CARGO_TARGET_DIR = "F:\claude-workbench\src-tauri\target"

# Source vcvarsall
$vcvars = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Auxiliary\Build\vcvarsall.bat"
$envOutput = & cmd /c "`"$vcvars`" x64 && set" 2>&1 | Out-String

# Parse and set environment variables from vcvars output
$envOutput -split "`n" | ForEach-Object {
    if ($_ -match '^(\w+)=(.*)$') {
        try {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        } catch {}
    }
}

# Build
Set-Location "F:\claude-workbench\src-tauri"
Write-Host "Building..."
& cargo build --release 2>&1