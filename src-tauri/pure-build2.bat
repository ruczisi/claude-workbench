@echo off
set CARGO_TARGET_DIR=F:\claude-workbench\src-tauri\target
set RUSTUP_HOME=C:\Users\dgqlx.WIN11\.rustup
set CARGO_HOME=C:\Users\dgqlx.WIN11\.cargo
set CC=x86_64-w64-mingw32-gcc
set CXX=x86_64-w64-mingw32-g++
set PATH=C:\Users\dgqlx.WIN11\.cargo\bin;C:\Users\dgqlx.WIN11\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained;%PATH%
cd /d F:\claude-workbench\src-tauri
cargo build --release
