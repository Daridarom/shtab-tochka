"""Regression tests: passing file, broken metadata, hidden edits and unsupported input."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "editorial_preflight.py"
spec = importlib.util.spec_from_file_location("editorial_preflight", SCRIPT)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

CORE_START = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/" '
    'xmlns:dcterms="http://purl.org/dc/terms/">'
)
WORD_START = ('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
              '<w:body><w:p>')

def make_docx(path, good=True):
    core = CORE_START + "<dc:title>Моя книга</dc:title>"
    if good:
        core += "<dc:creator>Автор</dc:creator>"
    core += "</cp:coreProperties>"
    body = WORD_START
    if not good:
        body += "<w:ins><w:r><w:t>В современном мире важно отметить, что ...</w:t></w:r></w:ins>"
    else:
        body += "<w:r><w:t>Вечером мы обсуждали письмо и уточнили факт.</w:t></w:r>"
    body += "</w:p></w:body></w:document>"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("docProps/core.xml", core)
        z.writestr("word/document.xml", body)
        if not good:
            z.writestr("word/comments.xml", "<comments/>")

class EditorialPreflightTests(unittest.TestCase):
    def test_good_docx_passes_and_remains_unchanged(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "good.docx"
            make_docx(path, good=True)
            before = path.read_bytes()
            report = gate.run(path)
            self.assertEqual(report["status"], "PASS", report)
            self.assertEqual(report["metadata"]["title"], "Моя книга")
            self.assertEqual(path.read_bytes(), before)
            self.assertNotIn("text", report)  # no manuscript copied into receipt

    def test_bad_docx_detected_without_claiming_ai_origin(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "bad.docx"
            make_docx(path, good=False)
            report = gate.run(path)
            codes = {x["code"] for x in report["findings"]}
            self.assertEqual(report["status"], "FIX")
            self.assertIn("missing_author", codes)
            self.assertIn("tracked_ins", codes)
            self.assertIn("comments_present", codes)
            self.assertIn("generic_opening", codes)
            self.assertIn("Не определяет авторство", report["disclaimer"])

    def test_plain_text_has_no_fake_metadata_obligation(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "draft.md"
            path.write_text("Собранные данные подтверждены ведомостью.", encoding="utf-8")
            report = gate.run(path)
            self.assertEqual(report["status"], "PASS")
            self.assertEqual(report["checks"]["metadata"], "N/A")

    def test_unsupported_format_is_not_pass(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "draft.epub"
            path.write_bytes(b"not supported")
            report = gate.run(path)
            self.assertEqual(report["status"], "NOT RUN")
            self.assertEqual(report["checks"]["format"], "NOT RUN")

    def test_corrupt_docx_is_fail(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "broken.docx"
            path.write_bytes(b"not a zip")
            report = gate.run(path)
            self.assertEqual(report["status"], "FAIL")

if __name__ == "__main__":
    unittest.main()
