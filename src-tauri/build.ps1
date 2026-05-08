[Environment]::SetEnvironmentVariable("Path", "D:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.50.35717\bin\Hostx64\x64;" + [Environment]::GetEnvironmentVariable("Path", "Process"), "Process")
[Environment]::SetEnvironmentVariable("VCToolsInstallDir", "D:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.50.35717\", "Process")
[Environment]::SetEnvironmentVariable("VCINSTALLDIR", "D:\Program Files\Microsoft Visual Studio\18\Community\VC\", "Process")
[Environment]::SetEnvironmentVariable("VSINSTALLDIR", "D:\Program Files\Microsoft Visual Studio\18\Community\", "Process")
[Environment]::SetEnvironmentVariable("VCToolsVersion", "14.50.35717", "Process")

Set-Location "F:\claude-workbench\src-tauri"
cargo build --release
