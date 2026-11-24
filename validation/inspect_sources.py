from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter
from xml.etree import ElementTree
from pathlib import Path
from typing import Any

from PIL import Image
from pypdf import PdfReader
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE


SUPPORTED_SUFFIXES = {".pdf", ".pptx", ".png", ".jpg", ".jpeg", ".webp"}


def _safe_text(value: str) -> str:
    return value.encode("utf-8", errors="replace").decode("utf-8")


def _iter_shapes(shapes: Any) -> Any:
    for shape in shapes:
        yield shape
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _iter_shapes(shape.shapes)


def _slide_xml_text(pptx_path: Path, slide_number: int) -> tuple[str, int]:
    member = f"ppt/slides/slide{slide_number}.xml"
    with zipfile.ZipFile(pptx_path) as archive:
        root = ElementTree.fromstring(archive.read(member))

    text_parts = []
    math_count = 0
    for element in root.iter():
        local_name = element.tag.rsplit("}", 1)[-1]
        if local_name == "t" and element.text:
            text_parts.append(element.text)
        if local_name in {"oMath", "oMathPara"}:
            math_count += 1

    return _safe_text("\n".join(text_parts).strip()), math_count


def inspect_pdf(path: Path) -> dict[str, Any]:
    reader = PdfReader(str(path))
    pages = []
    total_chars = 0
    total_images = 0
    empty_pages = []

    for index, page in enumerate(reader.pages, start=1):
        text = _safe_text(page.extract_text() or "")
        char_count = len(text.strip())
        try:
            image_count = len(page.images)
        except Exception:
            image_count = 0

        total_chars += char_count
        total_images += image_count
        if char_count < 10:
            empty_pages.append(index)

        pages.append(
            {
                "page": index,
                "charCount": char_count,
                "imageCount": image_count,
                "likelyScanned": char_count < 10 and image_count > 0,
                "textPreview": " ".join(text.split())[:200],
            }
        )

    return {
        "kind": "pdf",
        "pageCount": len(reader.pages),
        "totalChars": total_chars,
        "totalImages": total_images,
        "emptyOrLowTextPages": empty_pages,
        "pages": pages,
    }


def inspect_pptx(path: Path) -> dict[str, Any]:
    presentation = Presentation(str(path))
    slides = []
    total_chars = 0
    total_pictures = 0
    total_tables = 0
    total_charts = 0
    total_math_expressions = 0
    blank_slides = []

    for index, slide in enumerate(presentation.slides, start=1):
        xml_text, math_count = _slide_xml_text(path, index)
        picture_count = 0
        table_count = 0
        chart_count = 0

        for shape in _iter_shapes(slide.shapes):
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                picture_count += 1
            if getattr(shape, "has_table", False):
                table_count += 1
            if getattr(shape, "has_chart", False):
                chart_count += 1

        text = xml_text
        char_count = len(text)
        total_chars += char_count
        total_pictures += picture_count
        total_tables += table_count
        total_charts += chart_count
        total_math_expressions += math_count

        if char_count < 5:
            blank_slides.append(index)

        slides.append(
            {
                "slide": index,
                "charCount": char_count,
                "pictureCount": picture_count,
                "tableCount": table_count,
                "chartCount": chart_count,
                "mathExpressionCount": math_count,
                "likelyImageOnly": char_count < 5 and picture_count > 0 and math_count == 0,
                "likelyFormulaHeavy": math_count > 0 or bool(
                    re.search(r"[∫∑√±≤≥∞λμσρεΔ→]", text)
                ),
                "textPreview": " ".join(text.split())[:200],
            }
        )

    return {
        "kind": "pptx",
        "slideCount": len(presentation.slides),
        "totalChars": total_chars,
        "totalPictures": total_pictures,
        "totalTables": total_tables,
        "totalCharts": total_charts,
        "totalMathExpressions": total_math_expressions,
        "emptyOrLowTextSlides": blank_slides,
        "slides": slides,
    }


def inspect_image(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        return {
            "kind": "image",
            "format": image.format,
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
        }


def inspect_file(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return inspect_pdf(path)
    if suffix == ".pptx":
        return inspect_pptx(path)
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return inspect_image(path)
    raise ValueError(f"Unsupported file type: {suffix}")


def build_report(root: Path) -> dict[str, Any]:
    files = sorted(
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    )

    file_reports = []
    kind_counter: Counter[str] = Counter()
    warnings = []

    for path in files:
        try:
            report = inspect_file(path)
            kind_counter[report["kind"]] += 1
        except Exception as error:
            report = {
                "kind": "error",
                "error": f"{type(error).__name__}: {error}",
            }
            warnings.append(f"{path.relative_to(root)}: {report['error']}")

        report["file"] = path.relative_to(root).as_posix()
        report["sizeBytes"] = path.stat().st_size
        file_reports.append(report)

    return {
        "root": root.name,
        "fileCount": len(file_reports),
        "kindCounts": dict(kind_counter),
        "warnings": warnings,
        "files": file_reports,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Inspect local course files without calling an AI model."
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=str(Path(__file__).parent.parent / "local-samples"),
    )
    parser.add_argument("--output", help="Optional JSON report path.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        parser.error(f"Source directory does not exist: {root}")

    report = build_report(root)
    serialized = json.dumps(report, ensure_ascii=False, indent=2)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(serialized + "\n", encoding="utf-8")
        print(f"Wrote report to {output_path}")
    else:
        print(serialized)

    if report["warnings"]:
        print(f"Completed with {len(report['warnings'])} warning(s)")
        return 1

    print(
        f"Inspected {report['fileCount']} file(s): "
        f"{report['kindCounts'].get('pdf', 0)} PDF, "
        f"{report['kindCounts'].get('pptx', 0)} PPTX, "
        f"{report['kindCounts'].get('image', 0)} image"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
