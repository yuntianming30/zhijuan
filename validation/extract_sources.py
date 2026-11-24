from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from pypdf import PdfReader
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE


FORMULA_SYMBOLS = re.compile(r"[∫∑√±≤≥∞λμσρεΔ∇→∂]")
DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main"
MATH_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/math"


def safe_text(value: str) -> str:
    return value.encode("utf-8", errors="replace").decode("utf-8")


def document_id(relative_path: str) -> str:
    digest = hashlib.sha256(relative_path.encode("utf-8")).hexdigest()[:12]
    return f"doc-{digest}"


def iter_shapes(shapes: Any) -> Any:
    for shape in shapes:
        yield shape
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from iter_shapes(shape.shapes)


def slide_xml_info(pptx_path: Path, slide_number: int) -> dict[str, Any]:
    member = f"ppt/slides/slide{slide_number}.xml"
    with zipfile.ZipFile(pptx_path) as archive:
        xml_bytes = archive.read(member)

    root = ElementTree.fromstring(xml_bytes)
    text_parts = []
    math_parts = []
    math_count = 0
    ole_count = 0

    for element in root.iter():
        local_name = element.tag.rsplit("}", 1)[-1]
        if local_name == "t" and element.text:
            if element.tag.startswith(f"{{{MATH_NAMESPACE}}}"):
                math_parts.append(element.text)
            else:
                text_parts.append(element.text)
        if local_name == "oMath" or local_name == "oMathPara":
            math_count += 1
        if local_name == "oleObj":
            ole_count += 1

    return {
        "text": safe_text("\n".join(text_parts).strip()),
        "mathText": safe_text("\n".join(math_parts).strip()),
        "mathExpressionCount": math_count,
        "oleObjectCount": ole_count,
    }


def extract_pdf(path: Path, relative_path: str) -> dict[str, Any]:
    reader = PdfReader(str(path))
    pages = []
    warnings = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = safe_text(page.extract_text() or "")
        try:
            image_count = len(page.images)
        except Exception:
            image_count = 0

        char_count = len(text.strip())
        formula_suspected = bool(FORMULA_SYMBOLS.search(text))

        if char_count < 10 and image_count > 0:
            quality = "visualOnly"
            warnings.append(f"第 {page_number} 页几乎没有可提取文字，需要视觉模型或 OCR")
        elif formula_suspected:
            quality = "mixed"
            warnings.append(f"第 {page_number} 页包含公式符号，需检查公式顺序")
        else:
            quality = "nativeText"

        pages.append(
            {
                "page": page_number,
                "quality": quality,
                "charCount": char_count,
                "imageCount": image_count,
                "formulaSuspected": formula_suspected,
                "text": text,
                "locator": {"page": page_number},
            }
        )

    return {
        "id": document_id(relative_path),
        "relativePath": relative_path,
        "kind": "pdf",
        "pageCount": len(pages),
        "pages": pages,
        "warnings": warnings,
    }


def extract_pptx(path: Path, relative_path: str) -> dict[str, Any]:
    presentation = Presentation(str(path))
    slides = []
    warnings = []

    for slide_number, slide in enumerate(presentation.slides, start=1):
        xml_info = slide_xml_info(path, slide_number)
        picture_count = sum(
            1
            for shape in iter_shapes(slide.shapes)
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE
        )
        text = xml_info["text"]
        math_count = xml_info["mathExpressionCount"]
        ole_count = xml_info["oleObjectCount"]

        needs_visual_review = (
            math_count > 0
            or ole_count > 0
            or len(text.strip()) < 5
        )
        quality = "needsVisualReview" if needs_visual_review else "nativeText"

        if ole_count > 0:
            warnings.append(
                f"第 {slide_number} 页包含 {ole_count} 个嵌入对象，公式需通过图像核验"
            )
        elif math_count > 0:
            warnings.append(f"第 {slide_number} 页包含 Office 数学对象，需检查公式语义")
        elif len(text.strip()) < 5:
            warnings.append(f"第 {slide_number} 页几乎无文字，需检查视觉内容")

        slides.append(
            {
                "slide": slide_number,
                "quality": quality,
                "charCount": len(text),
                "pictureCount": picture_count,
                "mathExpressionCount": math_count,
                "oleObjectCount": ole_count,
                "text": text,
                "mathText": xml_info["mathText"],
                "locator": {"slide": slide_number},
            }
        )

    return {
        "id": document_id(relative_path),
        "relativePath": relative_path,
        "kind": "pptx",
        "slideCount": len(slides),
        "slides": slides,
        "warnings": warnings,
    }


def extract_sources(root: Path, output: Path) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    documents = []

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix not in {".pdf", ".pptx"}:
            continue
        if path.name.endswith(".rendered.pdf"):
            continue
        if path.resolve() == output.resolve():
            continue
        if output in path.parents:
            continue

        relative_path = path.relative_to(root).as_posix()
        if suffix == ".pdf":
            document = extract_pdf(path, relative_path)
        else:
            document = extract_pptx(path, relative_path)
        documents.append(document)

        course = relative_path.split("/", 1)[0]
        output_file = output / course / f"{path.stem}.json"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    courses: dict[str, dict[str, Any]] = {}
    for document in documents:
        course_name = document["relativePath"].split("/", 1)[0]
        course = courses.setdefault(
            course_name,
            {
                "documentCount": 0,
                "pdfCount": 0,
                "pptxCount": 0,
                "unitCount": 0,
                "nativeTextUnits": 0,
                "mixedUnits": 0,
                "visualReviewUnits": 0,
                "warningCount": 0,
            },
        )
        course["documentCount"] += 1
        course["warningCount"] += len(document["warnings"])

        if document["kind"] == "pdf":
            course["pdfCount"] += 1
            units = document["pages"]
        else:
            course["pptxCount"] += 1
            units = document["slides"]

        course["unitCount"] += len(units)
        for unit in units:
            quality = unit["quality"]
            if quality == "nativeText":
                course["nativeTextUnits"] += 1
            elif quality == "mixed":
                course["mixedUnits"] += 1
            elif quality in {"visualOnly", "needsVisualReview"}:
                course["visualReviewUnits"] += 1

    summary = {
        "sourceCount": len(documents),
        "pdfCount": sum(document["kind"] == "pdf" for document in documents),
        "pptxCount": sum(document["kind"] == "pptx" for document in documents),
        "warningCount": sum(len(document["warnings"]) for document in documents),
        "courses": courses,
        "documents": [
            {
                "id": document["id"],
                "relativePath": document["relativePath"],
                "kind": document["kind"],
                "pageCount": document.get("pageCount"),
                "slideCount": document.get("slideCount"),
                "warningCount": len(document["warnings"]),
            }
            for document in documents
        ],
    }

    (output / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract normalized local source text and quality warnings."
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=str(Path(__file__).parent.parent / "local-samples"),
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).parent.parent / "local-samples" / "extracted"),
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    output = Path(args.output).resolve()
    if not root.exists():
        parser.error(f"Source directory does not exist: {root}")

    summary = extract_sources(root, output)
    print(
        f"Extracted {summary['sourceCount']} document(s): "
        f"{summary['pdfCount']} PDF, {summary['pptxCount']} PPTX, "
        f"{summary['warningCount']} quality warning(s)"
    )
    print(f"Output: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
