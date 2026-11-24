from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from validation.validate_contracts import load_fixture, validate_payload


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "contract-scenarios.json"


class ContractValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.payload = load_fixture(FIXTURE_PATH)

    def test_reference_fixture_is_valid(self) -> None:
        self.assertEqual(validate_payload(self.payload), [])

    def test_rejects_blueprint_score_mismatch(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["scenarios"][0]["blueprint"]["sections"][0]["sectionScore"] = 21
        errors = validate_payload(payload)
        self.assertTrue(any("题量 × 单题分值" in error for error in errors))
        self.assertTrue(any("分区总分" in error for error in errors))

    def test_rejects_unknown_knowledge_node(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["scenarios"][0]["paper"]["questions"][0]["knowledgeNodeIds"] = [
            "kn-does-not-exist"
        ]
        errors = validate_payload(payload)
        self.assertTrue(any("知识点不存在" in error for error in errors))

    def test_rejects_missing_evidence_for_sourced_node(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["scenarios"][0]["graph"]["nodes"][0]["evidence"] = []
        errors = validate_payload(payload)
        self.assertTrue(any("sourced 节点必须有来源" in error for error in errors))

    def test_rejects_fabricated_document_reference(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["scenarios"][0]["paper"]["questions"][0]["evidence"][0][
            "documentId"
        ] = "doc-does-not-exist"
        errors = validate_payload(payload)
        self.assertTrue(any("不存在的文件" in error for error in errors))

    def test_rejects_section_question_count_mismatch(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["scenarios"][0]["paper"]["questions"].pop(0)
        errors = validate_payload(payload)
        self.assertTrue(any("应有 2 题，实际 1 题" in error for error in errors))

    def test_rejects_missing_rubric_for_self_graded_question(self) -> None:
        payload = copy.deepcopy(self.payload)
        payload["scenarios"][0]["paper"]["questions"][2]["rubric"] = []
        errors = validate_payload(payload)
        self.assertTrue(any("自评题必须提供评分点" in error for error in errors))

    def test_fixture_is_valid_json_text(self) -> None:
        text = FIXTURE_PATH.read_text(encoding="utf-8")
        json.loads(text)
        self.assertNotIn("sk-", text)


if __name__ == "__main__":
    unittest.main()
