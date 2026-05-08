@echo off
cd /d F:\claude-workbench\src-tauri
set CARGO_TARGET_DIR=F:\claude-workbench\src-tauri\target
set RUSTUP_HOME=C:\Users\dgqlx.WIN11\.rustup
set CARGO_HOME=C:\Users\dgqlx.WIN11\.cargo
set PATH=C:\Users\dgqlx.WIN11\.cargo\bin;C:\Users\dgqlx.WIN11\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained;%PATH%
call "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Auxiliary\Build\vcvarsall.bat" x64
cargo build --release