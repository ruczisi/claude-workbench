@echo off
cd /d F:\claude-workbench\src-tauri
set CARGO_TARGET_DIR=F:\claude-workbench\src-tauri\target
set RUSTUP_HOME=C:\Users\dgqlx.WIN11\.rustup
set CARGO_HOME=C:\Users\dgqlx.WIN11\.cargo
call "D:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
cargo build --release
