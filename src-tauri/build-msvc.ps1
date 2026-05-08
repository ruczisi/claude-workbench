# Proper MSVC build script
$vcvars = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Auxiliary\Build\vcvarsall.bat"
$msvcPath = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Tools\MSVC\14.38.33128"
$kitPath = "C:\Program Files (x86)\Windows Kits\10"

# Source vcvarsall and get all env vars
$envOutput = & cmd /c "`"$vcvars`" x64 && set" 2>&1 | Where-Object { $_ -match '^([^=]+)=(.*)$' }

# Parse and apply environment
foreach ($line in $envOutput) {
    if ($line -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

# Add cargo to path
$env:PATH = "C:\Users\dgqlx.WIN11\.cargo\bin;" + $env:PATH
$env:HOME = "C:\Users\dgqlx.WIN11"
$env:CARGO_HOME = "C:\Users\dgqlx.WIN11\.cargo"
$env:CARGO_TARGET_DIR = "F:\claude-workbench\src-tauri\target"

Set-Location "F:\claude-workbench\src-tauri"
Write-Host "Environment set up. Starting build..."
cargo build --release 2>&1