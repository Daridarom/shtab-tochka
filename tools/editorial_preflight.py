#!/usr/bin/env python3
"""Read-only editorial preflight for publication files. Not an AI detector.

Usage:
  python3 tools/editorial_preflight.py manuscript.docx
  python3 tools/editorial_preflight.py article.pdf --out report.json

No file is modified. Python 3.10+; PDFs require optional "pypdf" package.
All findings are signals for human editorial review, never proof of authorship.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
}
# Advisory markers; contexts, quotations, author voice are decided by an editor.
CLICHES = [
    ("generic_opening", r"в современном мире"),
    ("artificial_contrast", r"это не просто .{4,80}, а "),
    ("generic_claim", r"новые горизонты|уникальн\w* возможност\w*"),
    ("generic_framing", r"важно отметить, что|стоит подчеркнуть, что"),
    ("generic_conclusion", r"подводя итог|таким образом, можно сделать вывод"),
]
SERVICE = [
    ("assistant_preamble", r"^(?:конечно[!., ]|вот (?:улучшенная|готовая) версия)"),
    ("unresolved_placeholder", r"\[(?:укажите|вставьте|имя|дата|название)[^\]]{0,90}\]"),
    ("unfinished_work", r"\b(?:TODO|TBD|FIXME)\b"),
]
TEXT_LIMIT = 3_000_000

def finding(result, code, severity, detail, loc=None):
    issue = {"code": code, "severity": severity, "detail": detail}
    if loc is not None:
        issue["location"] = loc
    result["findings"].append(issue)

def xml_root(z, name):
    try:
        return ET.fromstring(z.read(name))
    except KeyError:
        return None

def value(root, prefix, field):
    if root is None:
        return None
    element = root.find(prefix + ":" + field, NS)
    return element.text.strip() if element is not None and element.text else None

def docx(path, report):
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        core = xml_root(z, "docProps/core.xml")
        content = xml_root(z, "word/document.xml")
        if core is None or content is None:
            raise ValueError("DOCX lacks core properties or primary document XML")
        title = value(core, "dc", "title")
        author = value(core, "dc", "creator")
        report["metadata"] = {"title": title, "author": author,
            "subject": value(core, "dc", "subject"),
            "keywords": value(core, "cp", "keywords"),
            "created": value(core, "dcterms", "created"),
            "modified": value(core, "dcterms", "modified")}
        report["checks"]["metadata"] = "PASS"
        for field in ("title", "author"):
            if not report["metadata"][field]:
                finding(report, "missing_" + field, "FIX",
                        "Заполнить только подтверждённое поле: " + field)
        created, modified = report["metadata"]["created"], report["metadata"]["modified"]
        if created and modified:
            try:
                def parse_stamp(s):
                    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
                if parse_stamp(created) > parse_stamp(modified):
                    finding(report, "date_inconsistency", "FIX",
                            "Дата создания позже даты изменения; нужна проверка фактической истории")
            except ValueError:
                finding(report, "date_format", "REVIEW", "Нестандартный формат даты")
        text_parts = []
        for node in content.iter():
            if node.tag == "{%s}t" % NS["w"] and node.text:
                text_parts.append(node.text)
        report["text"] = " ".join(text_parts)
        report["checks"]["text"] = "PASS"
        tracked = ("ins", "del", "moveFrom", "moveTo")
        for el in tracked:
            count = len(content.findall(".//w:" + el, NS))
            if count:
                finding(report, "tracked_" + el, "REVIEW",
                        "В финальном файле элементы исправлений: " + el + " (" + str(count) + ")")
        hidden = sum(1 for tag in ("vanish", "webHidden")
                     for _ in content.findall(".//w:" + tag, NS))
        if hidden:
            finding(report, "hidden_text_style", "REVIEW",
                    "Есть стиль скрытого текста, требуется ручная проверка: " + str(hidden))
        if any(name.startswith("word/comments") and name.endswith(".xml") for name in names):
            finding(report, "comments_present", "REVIEW",
                    "Есть комментарии, проверить, предназначены ли они для получателя")
        for name in names:
            if name.lower().endswith("vbaproject.bin"):
                finding(report, "macro_binary", "FIX",
                        "В пакете присутствует макрос: " + name)
        rels = xml_root(z, "word/_rels/document.xml.rels")
        if rels is not None:
            external = [el.attrib.get("Target", "") for el in rels
                        if el.attrib.get("TargetMode") == "External"]
            if external:
                finding(report, "external_relationships", "REVIEW",
                        "Проверить внешние связи: " + str(len(external)))
        report["checks"]["hidden"] = "REVIEW" if any(
            f["code"].startswith(("tracked_", "hidden_", "comments_", "macro_", "external_"))
            for f in report["findings"]) else "PASS"

def pdf(path, report):
    try:
        from pypdf import PdfReader
    except ImportError:
        report["checks"].update({"metadata": "NOT RUN", "text": "NOT RUN",
                                 "hidden": "NOT RUN"})
        finding(report, "pdf_dependency_missing", "NOT RUN",
                "Для проверки PDF установить pypdf в отдельном доверенном окружении")
        return
    reader = PdfReader(str(path))
    meta = reader.metadata or {}
    report["metadata"] = {
        "title": meta.get("/Title"), "author": meta.get("/Author"),
        "subject": meta.get("/Subject"), "keywords": meta.get("/Keywords"),
        "created": meta.get("/CreationDate"), "modified": meta.get("/ModDate"),
        "creator_software": meta.get("/Creator"), "producer": meta.get("/Producer")}
    report["checks"]["metadata"] = "PASS"
    for field in ("title", "author"):
        if not report["metadata"].get(field):
            finding(report, "missing_" + field, "FIX",
                    "Проверить заполнение достоверного поля PDF: " + field)
    text = []
    for page in reader.pages:
        text.append(page.extract_text() or "")
    report["text"] = "\n".join(text)
    report["checks"]["text"] = "PASS"
    if not report["text"].strip():
        finding(report, "missing_text_layer", "REVIEW",
                "Текстовый слой отсутствует или не извлекается; нужен визуальный анализ")
    try:
        xmp = reader.xmp_metadata
        if xmp:
            x_title = xmp.dc_title
            if isinstance(x_title, dict):
                x_title = next(iter(x_title.values()), None)
            p_title = report["metadata"].get("title")
            if x_title and p_title and str(x_title).strip() != str(p_title).strip():
                finding(report, "pdf_info_xmp_mismatch", "REVIEW",
                        "Title в PDF Info и XMP различаются")
    except Exception:
        finding(report, "xmp_read_error", "NOT RUN", "Не удалось проверить XMP")
    root = reader.trailer.get("/Root")
    obj = root.get_object() if root else {}
    if "/OpenAction" in obj or "/AA" in obj:
        finding(report, "pdf_actions", "REVIEW", "Есть действия PDF, нужна ручная проверка")
    if "/Names" in obj:
        finding(report, "pdf_names_tree", "REVIEW",
                "Есть каталог имён; проверить вложения и скрипты")
    if reader.is_encrypted:
        finding(report, "pdf_encrypted", "REVIEW", "Файл имеет ограничения PDF")
    report["checks"]["hidden"] = "REVIEW"  # static check cannot prove absence of hidden objects

def plain(path, report):
    report["text"] = path.read_text(encoding="utf-8-sig")
    report["checks"]["text"] = "PASS"
    report["checks"]["metadata"] = "N/A"  # text format does not define a metadata schema
    report["checks"]["hidden"] = "N/A"

def textual_checks(report):
    text = report.pop("text", "")
    report["text_characters"] = len(text)
    if not text:
        return
    if len(text) > TEXT_LIMIT:
        finding(report, "text_limit", "NOT RUN",
                "Слишком большой текст; проверка языковых фрагментов неполная")
        text = text[:TEXT_LIMIT]
    for code, pattern in CLICHES:
        matches = list(re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE))
        if matches:
            finding(report, code, "REVIEW",
                    "Риторическая формула: оценить по жанру и контексту, не удалять автоматически",
                    {"count": len(matches), "offsets": [m.start() for m in matches[:8]]})
    for code, pattern in SERVICE:
        matches = list(re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE))
        if matches:
            finding(report, code, "REVIEW", "Возможный черновой/служебный фрагмент",
                    {"count": len(matches), "offsets": [m.start() for m in matches[:8]]})

def run(path):
    result = {"schema": "editorial-preflight/v0.1", "file": path.name,
              "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
              "checks": {"format": "PASS"}, "metadata": {}, "findings": [],
              "disclaimer": "Не определяет авторство текста, не изменяет файл, не заменяет ручную приёмку."}
    try:
        ext = path.suffix.lower()
        if ext == ".docx":
            docx(path, result)
        elif ext == ".pdf":
            pdf(path, result)
        elif ext in (".txt", ".md"):
            plain(path, result)
        else:
            result["checks"]["format"] = "NOT RUN"
            finding(result, "unsupported_format", "NOT RUN", "Формат не поддерживается")
    except Exception as e:
        result["checks"]["format"] = "FAIL"
        result["checks"].setdefault("metadata", "NOT RUN")
        result["checks"].setdefault("text", "NOT RUN")
        result["checks"].setdefault("hidden", "NOT RUN")
        finding(result, "read_failure", "FAIL", type(e).__name__ + ": " + str(e)[:220])
    textual_checks(result)
    result["status"] = ("FAIL" if any(f["severity"] == "FAIL" for f in result["findings"])
                        else "NOT RUN" if any(v == "NOT RUN" for v in result["checks"].values())
                        else "FIX" if any(f["severity"] == "FIX" for f in result["findings"])
                        else "REVIEW" if any(f["severity"] == "REVIEW" for f in result["findings"])
                        else "PASS")
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("file", type=Path)
    p.add_argument("--out", type=Path)
    args = p.parse_args()
    if not args.file.is_file():
        p.error("File not found")
    report = json.dumps(run(args.file), ensure_ascii=False, indent=2, default=str)
    if args.out:
        args.out.write_text(report + "\n", encoding="utf-8")
    else:
        print(report)

if __name__ == "__main__":
    main()
