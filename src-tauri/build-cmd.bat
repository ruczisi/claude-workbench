@echo off
cd /d F:\claude-workbench\src-tauri
set CARGO_TARGET_DIR=F:\claude-workbench\src-tauri\target
set PATH=C:\Users\dgqlx.WIN11\.cargo\bin;%PATH%
call "C:\Program Files\Microsoft Visual Studio\2022\Preview\VC\Auxiliary\Build\vcvarsall.bat" x64
cargo build --release