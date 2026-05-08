# Use VS Preview's MSVC with LLVM's lld-link
$vcvars = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Auxiliary\Build\vcvarsall.bat"
$llvmPath = "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Tools\Llvm\x64\bin"

# Source vcvarsall
$envOutput = & cmd /c "`"$vcvars`" x64 && set" 2>&1 | Where-Object { $_ -match '^([^=]+)=(.*)$' }

# Parse and apply environment
foreach ($line in $envOutput) {
    if ($line -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

# Add LLVM tools to PATH (lld-link)
$env:PATH = "$llvmPath;" + $env:PATH
$env:PATH = "C:\Users\dgqlx.WIN11\.cargo\bin;" + $env:PATH
$env:HOME = "C:\Users\dgqlx.WIN11"
$env:CARGO_HOME = "C:\Users\dgqlx.WIN11\.cargo"
$env:CARGO_TARGET_DIR = "F:\claude-workbench\src-tauri\target"

# Tell cargo to use lld-link instead of link.exe
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = "$llvmPath\lld-link.exe"
$env:C_CXX_X86_64_PC_WINDOWS_MSVC = "$llvmPath\clang.exe"
$env:C_CXX_X86_64_PC_WINDOWS_GNU = ""

Set-Location "F:\claude-workbench\src-tauri"
Write-Host "Building with LLVM lld-link..."
cargo build --release 2>&1