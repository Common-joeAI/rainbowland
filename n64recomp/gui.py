"""
n64recomp GUI — N64 ROM → Native Windows EXE Converter
A full PyQt6 desktop application for the n64recomp pipeline.

Usage:
    pip install PyQt6
    python gui.py
"""

import sys
import os
import json
import shutil
import threading
from pathlib import Path
from datetime import datetime

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QFileDialog, QTextEdit, QProgressBar,
    QGroupBox, QCheckBox, QSpinBox, QLineEdit, QTabWidget,
    QScrollArea, QFrame, QSplitter, QStatusBar, QMenuBar,
    QMenu, QMessageBox, QComboBox, QStyle
)
from PyQt6.QtCore import (
    Qt, QThread, QObject, pyqtSignal, QTimer, QSize
)
from PyQt6.QtGui import (
    QFont, QColor, QPalette, QIcon, QTextCursor, QAction,
    QDragEnterEvent, QDropEvent
)


# ── Dark theme ─────────────────────────────────────────────────────────────────
DARK_STYLE = """
QMainWindow, QWidget {
    background-color: #1a1a2e;
    color: #e0e0e0;
    font-family: 'Segoe UI', sans-serif;
    font-size: 13px;
}
QGroupBox {
    border: 1px solid #16213e;
    border-radius: 6px;
    margin-top: 12px;
    padding: 8px;
    font-weight: bold;
    color: #00d4ff;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 4px;
}
QPushButton {
    background-color: #16213e;
    color: #e0e0e0;
    border: 1px solid #0f3460;
    border-radius: 5px;
    padding: 7px 16px;
    font-weight: bold;
}
QPushButton:hover { background-color: #0f3460; border-color: #00d4ff; }
QPushButton:pressed { background-color: #00d4ff; color: #1a1a2e; }
QPushButton:disabled { background-color: #111; color: #555; border-color: #333; }
QPushButton#run_btn {
    background-color: #0f3460;
    color: #00d4ff;
    border: 2px solid #00d4ff;
    font-size: 15px;
    padding: 10px 24px;
    border-radius: 6px;
}
QPushButton#run_btn:hover { background-color: #00d4ff; color: #1a1a2e; }
QPushButton#run_btn:disabled { background-color: #111; color: #444; border-color: #333; }
QLineEdit, QTextEdit, QSpinBox, QComboBox {
    background-color: #16213e;
    color: #e0e0e0;
    border: 1px solid #0f3460;
    border-radius: 4px;
    padding: 4px 8px;
}
QLineEdit:focus, QTextEdit:focus { border-color: #00d4ff; }
QProgressBar {
    background-color: #16213e;
    border: 1px solid #0f3460;
    border-radius: 4px;
    text-align: center;
    color: #e0e0e0;
    height: 22px;
}
QProgressBar::chunk { background-color: #00d4ff; border-radius: 3px; }
QTabWidget::pane { border: 1px solid #0f3460; border-radius: 4px; }
QTabBar::tab {
    background-color: #16213e;
    color: #888;
    border: 1px solid #0f3460;
    padding: 6px 16px;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
}
QTabBar::tab:selected { background-color: #0f3460; color: #00d4ff; }
QTabBar::tab:hover { color: #e0e0e0; }
QScrollBar:vertical {
    background: #16213e; width: 10px; border-radius: 5px;
}
QScrollBar::handle:vertical {
    background: #0f3460; border-radius: 5px; min-height: 20px;
}
QCheckBox { color: #e0e0e0; spacing: 6px; }
QCheckBox::indicator {
    width: 16px; height: 16px;
    border: 1px solid #0f3460; border-radius: 3px;
    background: #16213e;
}
QCheckBox::indicator:checked { background: #00d4ff; border-color: #00d4ff; }
QStatusBar { background-color: #0f3460; color: #aaa; font-size: 12px; }
QMenuBar { background-color: #16213e; color: #e0e0e0; }
QMenuBar::item:selected { background-color: #0f3460; }
QMenu { background-color: #16213e; color: #e0e0e0; border: 1px solid #0f3460; }
QMenu::item:selected { background-color: #0f3460; }
QSplitter::handle { background-color: #0f3460; }
QLabel#rom_drop {
    border: 2px dashed #0f3460;
    border-radius: 8px;
    color: #555;
    font-size: 14px;
    padding: 20px;
}
QLabel#rom_drop[loaded="true"] {
    border-color: #00d4ff;
    color: #00d4ff;
}
"""

LOG_COLORS = {
    "INFO":    "#e0e0e0",
    "OK":      "#00ff88",
    "WARN":    "#ffcc00",
    "ERROR":   "#ff4444",
    "STAGE":   "#00d4ff",
    "AI":      "#bb88ff",
    "DONE":    "#00ff88",
}


# ── Worker thread ──────────────────────────────────────────────────────────────
class PipelineWorker(QObject):
    log       = pyqtSignal(str, str)   # message, level
    progress  = pyqtSignal(int, str)   # percent, stage_label
    finished  = pyqtSignal(bool, str)  # success, output_dir

    def __init__(self, rom_path: str, output_dir: str, options: dict):
        super().__init__()
        self.rom_path   = rom_path
        self.output_dir = output_dir
        self.options    = options
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        try:
            self._run_pipeline()
        except Exception as e:
            self.log.emit(f"Fatal error: {e}", "ERROR")
            self.finished.emit(False, "")

    def _log(self, msg, level="INFO"):
        self.log.emit(msg, level)

    def _run_pipeline(self):
        sys.path.insert(0, str(Path(__file__).parent))

        # ── Stage 1 ───────────────────────────────────────────────────────────
        self.progress.emit(5, "Stage 1 — Loading ROM...")
        self._log("━━━ Stage 1: ROM Parser ━━━", "STAGE")
        from stage1_rom import load_rom
        rom = load_rom(self.rom_path)
        self._log(f"  Title:       {rom.title}", "OK")
        self._log(f"  Entry point: 0x{rom.entry_point:08X}", "OK")
        self._log(f"  CIC:         {rom.cic_chip}", "OK")
        self._log(f"  Size:        {rom.size / 1024 / 1024:.1f} MB", "OK")
        if self._cancelled: return

        # ── Stage 2 ───────────────────────────────────────────────────────────
        self.progress.emit(20, "Stage 2 — Disassembling MIPS...")
        self._log("\n━━━ Stage 2: MIPS Disassembler ━━━", "STAGE")
        from stage2_disasm import disassemble_rom
        max_instrs = self.options.get("max_instrs", 0) or None
        disasms = disassemble_rom(rom, max_instrs=max_instrs)
        total_instrs = sum(len(d.instructions) for d in disasms)
        total_calls  = sum(len(d.jump_targets)  for d in disasms)
        self._log(f"  Instructions: {total_instrs:,}", "OK")
        self._log(f"  Call targets: {total_calls:,}", "OK")
        if self._cancelled: return

        # ── Stage 3 ───────────────────────────────────────────────────────────
        self.progress.emit(40, "Stage 3 — Detecting functions...")
        self._log("\n━━━ Stage 3: Function Boundary Detection ━━━", "STAGE")
        use_ai = self.options.get("use_ai", True)
        if use_ai:
            self._log("  Using Groq AI (llama-3.3-70b-versatile)...", "AI")
        else:
            self._log("  Using heuristic mode (no API key)", "WARN")
        from stage3_ai_boundaries import detect_boundaries
        all_bounds = []
        for i, dr in enumerate(disasms):
            self._log(f"  Segment {i+1}/{len(disasms)}...", "INFO")
            b = detect_boundaries(dr, use_ai=use_ai,
                                  groq_key=self.options.get("groq_key",""))
            all_bounds.append(b)
            self._log(f"    → {len(b.functions)} functions", "OK")
        if self._cancelled: return

        # ── Stage 4 ───────────────────────────────────────────────────────────
        self.progress.emit(65, "Stage 4 — Generating C code...")
        self._log("\n━━━ Stage 4: C Code Generator ━━━", "STAGE")
        from stage4_codegen import generate_code
        max_funcs = self.options.get("max_funcs", 0) or None
        cg = generate_code(disasms[0], all_bounds[0],
                           use_ai=use_ai, max_funcs=max_funcs,
                           groq_key=self.options.get("groq_key",""))
        ai_count  = sum(1 for f in cg.functions if f.method == "ai")
        det_count = sum(1 for f in cg.functions if f.method == "deterministic")
        stub_count= sum(1 for f in cg.functions if f.method == "stub")
        self._log(f"  AI-translated:  {ai_count}", "AI")
        self._log(f"  Deterministic:  {det_count}", "OK")
        self._log(f"  Stubs:          {stub_count}", "WARN")
        warn_count = sum(len(f.warnings) for f in cg.functions)
        if warn_count:
            self._log(f"  Warnings: {warn_count}", "WARN")
        if self._cancelled: return

        # ── Stage 5 ───────────────────────────────────────────────────────────
        self.progress.emit(85, "Stage 5 — Building VS project...")
        self._log("\n━━━ Stage 5: Visual Studio Project ━━━", "STAGE")
        from stage5_vsproject import generate_vs_project
        hal_dir = Path(__file__).parent / "hal"
        out = generate_vs_project(cg, rom.title, rom.entry_point,
                                   self.output_dir, hal_dir)
        self._log(f"  Output: {out}", "OK")

        # ── Summary ───────────────────────────────────────────────────────────
        self.progress.emit(100, "Done!")
        self._log("\n━━━ Complete ━━━", "DONE")
        self._log(f"  Functions: {len(cg.functions)}", "DONE")
        self._log(f"  Output:    {out}", "DONE")
        self._log("  → Run build_vs.bat to generate the .sln", "DONE")
        self._log("  → Open the .sln in Visual Studio 2022 and build", "DONE")
        self.finished.emit(True, str(out))


# ── Log widget ─────────────────────────────────────────────────────────────────
class LogWidget(QTextEdit):
    def __init__(self):
        super().__init__()
        self.setReadOnly(True)
        self.setFont(QFont("Cascadia Code, Consolas, monospace", 11))
        self.setStyleSheet("""
            QTextEdit {
                background-color: #0d0d1a;
                border: 1px solid #0f3460;
                border-radius: 4px;
                padding: 4px;
            }
        """)

    def append_log(self, msg: str, level: str = "INFO"):
        color = LOG_COLORS.get(level, "#e0e0e0")
        timestamp = datetime.now().strftime("%H:%M:%S")
        icon = {"OK": "✅", "ERROR": "❌", "WARN": "⚠️",
                "STAGE": "━", "AI": "🤖", "DONE": "🎉"}.get(level, "  ")
        html = (f'<span style="color:#444">[{timestamp}]</span> '
                f'<span style="color:{color}">{icon} {msg}</span>')
        self.append(html)
        self.moveCursor(QTextCursor.MoveOperation.End)

    def clear_log(self):
        self.clear()


# ── Drop zone ──────────────────────────────────────────────────────────────────
class RomDropZone(QLabel):
    rom_loaded = pyqtSignal(str)

    def __init__(self):
        super().__init__()
        self.setObjectName("rom_drop")
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setMinimumHeight(110)
        self.setAcceptDrops(True)
        self._set_empty()

    def _set_empty(self):
        self.setText("🎮  Drop a .z64 / .v64 / .n64 ROM here\n\n or click Browse")
        self.setProperty("loaded", "false")
        self.style().unpolish(self)
        self.style().polish(self)

    def set_rom(self, path: str):
        name = Path(path).name
        size = Path(path).stat().st_size / 1024 / 1024
        self.setText(f"🎮  {name}\n\n{size:.1f} MB  ·  {path}")
        self.setProperty("loaded", "true")
        self.style().unpolish(self)
        self.style().polish(self)

    def dragEnterEvent(self, e: QDragEnterEvent):
        if e.mimeData().hasUrls():
            url = e.mimeData().urls()[0].toLocalFile()
            if url.lower().endswith((".z64", ".v64", ".n64", ".rom")):
                e.acceptProposedAction()

    def dropEvent(self, e: QDropEvent):
        url = e.mimeData().urls()[0].toLocalFile()
        self.set_rom(url)
        self.rom_loaded.emit(url)

    def mousePressEvent(self, e):
        path, _ = QFileDialog.getOpenFileName(
            self, "Select N64 ROM", "",
            "N64 ROMs (*.z64 *.v64 *.n64 *.rom);;All files (*)")
        if path:
            self.set_rom(path)
            self.rom_loaded.emit(path)


# ── Main window ────────────────────────────────────────────────────────────────
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("n64recomp  —  N64 ROM → Windows EXE")
        self.setMinimumSize(960, 700)
        self.resize(1100, 760)
        self.rom_path    = ""
        self.output_dir  = str(Path.home() / "n64recomp_output")
        self.worker      = None
        self.worker_thread = None
        self._build_menu()
        self._build_ui()
        self._update_run_button()

    # ── Menu ──────────────────────────────────────────────────────────────────
    def _build_menu(self):
        mb = self.menuBar()
        file_m = mb.addMenu("File")
        open_a = QAction("Open ROM…", self)
        open_a.setShortcut("Ctrl+O")
        open_a.triggered.connect(self._browse_rom)
        file_m.addAction(open_a)
        file_m.addSeparator()
        quit_a = QAction("Quit", self)
        quit_a.setShortcut("Ctrl+Q")
        quit_a.triggered.connect(self.close)
        file_m.addAction(quit_a)

        help_m = mb.addMenu("Help")
        about_a = QAction("About n64recomp", self)
        about_a.triggered.connect(self._show_about)
        help_m.addAction(about_a)

    # ── UI layout ─────────────────────────────────────────────────────────────
    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(12, 12, 12, 8)
        root.setSpacing(10)

        # ── Title bar ─────────────────────────────────────────────────────────
        title_lbl = QLabel("n64recomp")
        title_lbl.setFont(QFont("Segoe UI", 22, QFont.Weight.Bold))
        title_lbl.setStyleSheet("color: #00d4ff;")
        sub_lbl = QLabel("N64 ROM → Native Windows x64 EXE  •  No emulator")
        sub_lbl.setStyleSheet("color: #555; font-size: 12px;")
        title_row = QHBoxLayout()
        title_row.addWidget(title_lbl)
        title_row.addWidget(sub_lbl, 1, Qt.AlignmentFlag.AlignBottom)
        root.addLayout(title_row)

        # ── Splitter: left panel | log ─────────────────────────────────────────
        splitter = QSplitter(Qt.Orientation.Horizontal)
        root.addWidget(splitter, 1)

        # Left panel
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 6, 0)
        left_layout.setSpacing(10)

        # ROM drop zone
        rom_box = QGroupBox("ROM File")
        rom_box_l = QVBoxLayout(rom_box)
        self.drop_zone = RomDropZone()
        self.drop_zone.rom_loaded.connect(self._on_rom_loaded)
        rom_box_l.addWidget(self.drop_zone)
        browse_btn = QPushButton("Browse…")
        browse_btn.setFixedWidth(90)
        browse_btn.clicked.connect(self._browse_rom)
        rom_box_l.addWidget(browse_btn, 0, Qt.AlignmentFlag.AlignRight)
        left_layout.addWidget(rom_box)

        # Output dir
        out_box = QGroupBox("Output Directory")
        out_box_l = QHBoxLayout(out_box)
        self.out_edit = QLineEdit(self.output_dir)
        self.out_edit.textChanged.connect(lambda t: setattr(self, 'output_dir', t))
        out_browse = QPushButton("Browse…")
        out_browse.setFixedWidth(80)
        out_browse.clicked.connect(self._browse_output)
        out_box_l.addWidget(self.out_edit)
        out_box_l.addWidget(out_browse)
        left_layout.addWidget(out_box)

        # Options tabs
        opt_tabs = QTabWidget()

        # Build options
        build_tab = QWidget()
        build_l = QVBoxLayout(build_tab)
        build_l.setSpacing(8)
        self.cb_ai = QCheckBox("Use Groq AI for function analysis  (recommended)")
        self.cb_ai.setChecked(True)
        self.cb_ai.stateChanged.connect(self._on_ai_toggled)
        build_l.addWidget(self.cb_ai)

        # Groq key row
        groq_row = QHBoxLayout()
        groq_label = QLabel("Groq API key:")
        groq_label.setFixedWidth(100)
        self.groq_edit = QLineEdit()
        self.groq_edit.setPlaceholderText("gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
        self.groq_edit.setEchoMode(QLineEdit.EchoMode.Password)
        # Pre-fill from env
        self.groq_edit.setText(os.environ.get("GROQ_API_KEY", ""))
        groq_row.addWidget(groq_label)
        groq_row.addWidget(self.groq_edit)
        build_l.addLayout(groq_row)

        # Max funcs / instrs
        limits_row = QHBoxLayout()
        limits_row.addWidget(QLabel("Max functions (0 = all):"))
        self.max_funcs = QSpinBox()
        self.max_funcs.setRange(0, 100000)
        self.max_funcs.setValue(0)
        self.max_funcs.setFixedWidth(80)
        limits_row.addWidget(self.max_funcs)
        limits_row.addStretch()
        build_l.addLayout(limits_row)
        build_l.addStretch()
        opt_tabs.addTab(build_tab, "Build")

        # Info tab
        info_tab = QWidget()
        info_l = QVBoxLayout(info_tab)
        info_text = QTextEdit()
        info_text.setReadOnly(True)
        info_text.setMarkdown("""
**Pipeline stages:**

1. **ROM Parser** — validates header, detects byte order (z64/v64/n64), extracts code
2. **MIPS Disassembler** — decodes every R4300i instruction via rabbitizer
3. **AI Function Detection** — Groq llama-3.3-70b finds function boundaries
4. **C Code Generator** — translates MIPS → C (AI + deterministic hybrid)
5. **VS Project** — writes CMakeLists, HAL, main.c → ready to compile

**Requirements to build the output:**
- Visual Studio 2022 with C++ workload
- CMake 3.20+
- SDL2, OpenAL (see SETUP_DEPS.md in output)
        """)
        info_l.addWidget(info_text)
        opt_tabs.addTab(info_tab, "Info")

        left_layout.addWidget(opt_tabs, 1)

        # Progress + Run button
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        self.progress_label = QLabel("Ready")
        self.progress_label.setStyleSheet("color: #555; font-size: 12px;")
        left_layout.addWidget(self.progress_bar)
        left_layout.addWidget(self.progress_label)

        btn_row = QHBoxLayout()
        self.run_btn = QPushButton("▶  Convert ROM")
        self.run_btn.setObjectName("run_btn")
        self.run_btn.setFixedHeight(44)
        self.run_btn.clicked.connect(self._on_run)
        self.cancel_btn = QPushButton("✕  Cancel")
        self.cancel_btn.setFixedWidth(90)
        self.cancel_btn.setEnabled(False)
        self.cancel_btn.clicked.connect(self._on_cancel)
        self.open_btn = QPushButton("📁  Open Output")
        self.open_btn.setEnabled(False)
        self.open_btn.clicked.connect(self._open_output)
        btn_row.addWidget(self.run_btn, 1)
        btn_row.addWidget(self.cancel_btn)
        btn_row.addWidget(self.open_btn)
        left_layout.addLayout(btn_row)

        splitter.addWidget(left)

        # Right: log
        log_box = QGroupBox("Console")
        log_l = QVBoxLayout(log_box)
        self.log_widget = LogWidget()
        log_btn_row = QHBoxLayout()
        clear_btn = QPushButton("Clear")
        clear_btn.setFixedWidth(60)
        clear_btn.clicked.connect(self.log_widget.clear_log)
        log_btn_row.addStretch()
        log_btn_row.addWidget(clear_btn)
        log_l.addLayout(log_btn_row)
        log_l.addWidget(self.log_widget)
        splitter.addWidget(log_box)

        splitter.setSizes([420, 580])

        # Status bar
        sb = QStatusBar()
        self.setStatusBar(sb)
        self.status_lbl = QLabel("n64recomp ready")
        sb.addWidget(self.status_lbl)

        # Welcome log
        self.log_widget.append_log("n64recomp started", "OK")
        self.log_widget.append_log("Drop a ROM file to begin", "INFO")

    # ── Handlers ──────────────────────────────────────────────────────────────
    def _browse_rom(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Select N64 ROM", "",
            "N64 ROMs (*.z64 *.v64 *.n64 *.rom);;All files (*)")
        if path:
            self.drop_zone.set_rom(path)
            self._on_rom_loaded(path)

    def _browse_output(self):
        d = QFileDialog.getExistingDirectory(self, "Select Output Directory",
                                              self.output_dir)
        if d:
            self.output_dir = d
            self.out_edit.setText(d)

    def _on_rom_loaded(self, path: str):
        self.rom_path = path
        self.log_widget.append_log(f"ROM loaded: {Path(path).name}", "OK")
        self._update_run_button()

    def _on_ai_toggled(self, state):
        self.groq_edit.setEnabled(bool(state))

    def _update_run_button(self):
        ready = bool(self.rom_path) and (self.worker is None)
        self.run_btn.setEnabled(ready)

    def _on_run(self):
        if not self.rom_path:
            QMessageBox.warning(self, "No ROM", "Please select a ROM file first.")
            return

        self.log_widget.clear_log()
        self.log_widget.append_log(f"Starting conversion: {Path(self.rom_path).name}", "STAGE")
        self.progress_bar.setValue(0)
        self.run_btn.setEnabled(False)
        self.cancel_btn.setEnabled(True)
        self.open_btn.setEnabled(False)
        self.status_lbl.setText("Converting...")

        options = {
            "use_ai":    self.cb_ai.isChecked(),
            "groq_key":  self.groq_edit.text().strip(),
            "max_funcs": self.max_funcs.value(),
        }
        if options["groq_key"]:
            os.environ["GROQ_API_KEY"] = options["groq_key"]

        self.worker = PipelineWorker(self.rom_path, self.output_dir, options)
        self.worker_thread = QThread()
        self.worker.moveToThread(self.worker_thread)
        self.worker_thread.started.connect(self.worker.run)
        self.worker.log.connect(self._on_log)
        self.worker.progress.connect(self._on_progress)
        self.worker.finished.connect(self._on_finished)
        self.worker_thread.start()

    def _on_cancel(self):
        if self.worker:
            self.worker.cancel()
            self.log_widget.append_log("Cancelling...", "WARN")
        self.cancel_btn.setEnabled(False)

    def _on_log(self, msg: str, level: str):
        self.log_widget.append_log(msg, level)

    def _on_progress(self, pct: int, label: str):
        self.progress_bar.setValue(pct)
        self.progress_label.setText(label)
        self.status_lbl.setText(label)

    def _on_finished(self, success: bool, output_dir: str):
        self.worker_thread.quit()
        self.worker_thread.wait()
        self.worker = None
        self.worker_thread = None
        self.cancel_btn.setEnabled(False)
        self._update_run_button()
        if success:
            self.open_btn.setEnabled(True)
            self._last_output = output_dir
            self.status_lbl.setText(f"Done! → {output_dir}")
            QMessageBox.information(
                self, "Conversion Complete",
                f"Project generated at:\n{output_dir}\n\n"
                "Double-click build_vs.bat, then open the .sln in Visual Studio 2022 and build."
            )
        else:
            self.status_lbl.setText("Conversion failed — see console")

    def _open_output(self):
        if hasattr(self, '_last_output'):
            import subprocess
            subprocess.Popen(f'explorer "{self._last_output}"')

    def _show_about(self):
        QMessageBox.about(self, "About n64recomp",
            "<b>n64recomp v1.0</b><br><br>"
            "Convert N64 ROMs to native Windows executables.<br><br>"
            "Pipeline: ROM Parser → MIPS Disassembler → AI Function Detection "
            "→ C Code Generator → Visual Studio Project<br><br>"
            "Uses: rabbitizer, Groq AI, SDL2, OpenAL, CMake<br><br>"
            "github.com/Common-joeAI/n64recomp"
        )


# ── Entry point ────────────────────────────────────────────────────────────────
def main():
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setStyleSheet(DARK_STYLE)
    app.setApplicationName("n64recomp")
    app.setOrganizationName("Common-joeAI")

    win = MainWindow()
    win.show()

    # If a ROM was passed on the command line, load it
    if len(sys.argv) > 1 and Path(sys.argv[1]).exists():
        win.drop_zone.set_rom(sys.argv[1])
        win._on_rom_loaded(sys.argv[1])

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
