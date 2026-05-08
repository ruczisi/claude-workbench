@echo off
"C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Auxiliary\Build\vcvarsall.bat" x64
cd /d F:\claude-workbench\src-tauri
set CARGO_TARGET_DIR=F:\claude-workbench\src-tauri\target
cargo clean
cargo build --release