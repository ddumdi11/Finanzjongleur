"""
redact_statement.py — Sichere Schwaerzung von Kontoauszug-PDFs.

Entfernt personenbezogene Angaben ZUVERLAESSIG aus dem Textlayer
eines PDF — nicht nur visuell ueberdeckt. Das ist wichtig, weil
viele PDF-Tools nur Rechtecke darueberlegen; der Text dahinter
bleibt aber extrahierbar und laesst sich von jeder Software
auslesen, die den Textlayer liest.

Dieses Skript verwendet PyMuPDF (fitz), das beim Anwenden einer
Redaction den zugrunde liegenden Content-Stream neu schreibt —
der Text ist anschliessend tatsaechlich weg.

Voraussetzungen
---------------
    pip install pymupdf

Verwendung
----------
Einzelne Datei:
    python scripts/redact_statement.py pfad/zur/datei.pdf

Alle PDFs in einem Ordner:
    python scripts/redact_statement.py pfad/zum/ordner/ -o ausgabeordner/

Konfiguration
-------------
Das Skript liest `redact_config.json` aus dem eigenen Verzeichnis.
Vorlage: `redact_config.example.json`. Die echte Konfiguration
gehoert NICHT ins Git — sie ist in der `.gitignore` eingetragen.

Sicherheit
----------
Nach der Schwaerzung wird der Textlayer des Ergebnisses erneut
durchsucht. Wenn noch etwas aus der Konfiguration oder ein
regulaer erkanntes Muster (IBAN etc.) auftaucht, scheitert das
Skript mit einer Fehlermeldung. Das dient als Sicherheitsnetz,
damit nichts unbemerkt durchrutscht.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.stderr.write(
        "Fehler: PyMuPDF ist nicht installiert.\n"
        "Installiere es mit:  pip install pymupdf\n"
    )
    sys.exit(1)


# Regex-Muster, die unabhaengig von der Konfiguration immer entfernt werden.
# Deckt IBAN (mit und ohne Leerzeichen) und deutsche BIC ab.
REGEX_PATTERNS: list[str] = [
    # IBAN mit optionalen Leerzeichen als 4er-Gruppen: DE12 3456 7890 1234 5678 90
    r"DE\d{2}(?:\s?\d{4}){4}\s?\d{2}",
    # IBAN kompakt ohne Leerzeichen: DE12345678901234567890
    r"\bDE\d{20}\b",
    # Deutsche BIC (8 oder 11 Zeichen), immer nach Praefix "BIC:"
    r"(?<=BIC:\s)[A-Z]{4}DE[A-Z0-9]{2}(?:[A-Z0-9]{3})?",
    # BIC-Form fuer andere Laender ebenfalls nach "BIC: "
    r"(?<=BIC:\s)[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?",
]


def load_config(script_dir: Path) -> dict:
    cfg_path = script_dir / "redact_config.json"
    if not cfg_path.exists():
        sys.stderr.write(
            f"Fehler: {cfg_path} nicht gefunden.\n"
            "Kopiere 'redact_config.example.json' nach 'redact_config.json' "
            "und trage deine Daten ein.\n"
        )
        sys.exit(1)
    try:
        return json.loads(cfg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.stderr.write(f"Fehler: {cfg_path} ist kein gueltiges JSON: {e}\n")
        sys.exit(1)


def literal_targets(config: dict) -> list[str]:
    """Sammle konkrete Strings, die im PDF direkt gesucht werden."""
    targets: list[str] = []
    if config.get("name"):
        targets.append(config["name"])
    for line in config.get("address_lines", []) or []:
        if line:
            targets.append(line)
    for key in ("account_number", "customer_number", "bank_code", "bic"):
        if config.get(key):
            targets.append(config[key])
    for extra in config.get("extras", []) or []:
        if extra:
            targets.append(extra)
    return targets


def collect_matches_on_page(page: "fitz.Page", config: dict) -> set[str]:
    """Finde alle zu schwaerzenden Strings auf einer Seite."""
    text = page.get_text()
    matches: set[str] = set()

    # Literal-Strings aus der Konfiguration
    for target in literal_targets(config):
        if target in text:
            matches.add(target)

    # Regex-Treffer
    for pat in REGEX_PATTERNS:
        for m in re.finditer(pat, text):
            if m.group():
                matches.add(m.group())

    return matches


def redact_pdf(input_path: Path, output_path: Path, config: dict) -> int:
    """Redigiert das PDF und speichert das Ergebnis. Gibt Anzahl der Schwaerzungen zurueck."""
    doc = fitz.open(input_path)
    total_hits = 0

    for page in doc:
        for target in collect_matches_on_page(page, config):
            for rect in page.search_for(target):
                page.add_redact_annot(rect, fill=(0, 0, 0))
                total_hits += 1
        # PyMuPDF entfernt den zugrunde liegenden Text beim Anwenden.
        page.apply_redactions()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return total_hits


def verify(output_path: Path, config: dict) -> list[str]:
    """Prueft, ob nach der Schwaerzung noch sensible Inhalte lesbar sind."""
    doc = fitz.open(output_path)
    full_text = "".join(page.get_text() for page in doc)
    doc.close()

    leaks: list[str] = []
    for target in literal_targets(config):
        if target and target in full_text:
            leaks.append(target)
    for pat in REGEX_PATTERNS:
        for m in re.finditer(pat, full_text):
            leaks.append(m.group())
    return leaks


def process_file(src: Path, dst: Path, config: dict) -> bool:
    print(f"-> {src.name}")
    hits = redact_pdf(src, dst, config)
    leaks = verify(dst, config)
    if leaks:
        sys.stderr.write(
            f"   FEHLER: {len(leaks)} Reste im Textlayer gefunden. Datei NICHT teilen!\n"
        )
        for leak in leaks:
            sys.stderr.write(f"     - {leak}\n")
        return False
    print(f"   OK ({hits} Schwaerzungen) -> {dst.name}")
    return True


def resolve_output(src: Path, out_arg: Path | None) -> Path:
    if out_arg is not None:
        return out_arg
    return src.with_name(src.stem + "_redacted" + src.suffix)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Schwaerzt Kontoauszug-PDFs zuverlaessig (Textlayer entfernt, nicht nur ueberdeckt).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input", type=Path, help="PDF-Datei oder Verzeichnis mit PDFs")
    parser.add_argument("-o", "--output", type=Path, default=None,
                        help="Ausgabedatei (bei Einzeldatei) oder Ausgabeordner (bei Verzeichnis)")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    config = load_config(script_dir)

    if not args.input.exists():
        sys.stderr.write(f"Fehler: {args.input} existiert nicht.\n")
        return 1

    all_ok = True

    if args.input.is_dir():
        out_dir = args.output or args.input.parent / (args.input.name + "_redacted")
        out_dir.mkdir(parents=True, exist_ok=True)
        pdfs = sorted(args.input.glob("*.pdf"))
        if not pdfs:
            sys.stderr.write(f"Keine PDFs in {args.input} gefunden.\n")
            return 1
        for pdf in pdfs:
            ok = process_file(pdf, out_dir / pdf.name, config)
            all_ok = all_ok and ok
    else:
        out = resolve_output(args.input, args.output)
        all_ok = process_file(args.input, out, config)

    return 0 if all_ok else 2


if __name__ == "__main__":
    sys.exit(main())
