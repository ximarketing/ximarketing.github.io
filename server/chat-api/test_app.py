import unittest

import app


class PayloadTests(unittest.TestCase):
    def test_valid_payload_is_normalized(self):
        result = app.validate_payload(
            {
                "message": "  李曦研究什么？ ",
                "history": [{"role": "assistant", "content": "你好"}],
                "locale": "zh-CN",
                "page": {"path": "/", "title": "Xi Li"},
            }
        )
        self.assertEqual(result["message"], "李曦研究什么？")
        self.assertEqual(result["locale"], "zh-Hans")

    def test_rejects_model_override(self):
        with self.assertRaises(app.PublicError):
            app.validate_payload({"message": "hello", "model": "untrusted/model"})

    def test_rejects_long_message(self):
        with self.assertRaises(app.PublicError):
            app.validate_payload({"message": "x" * 1001})


class ResponseTests(unittest.TestCase):
    def setUp(self):
        self.context = {
            "sources": {
                "page:home": {"title": "Home", "url": "https://ximarketing.ai/"},
                "page:bad": {"title": "Bad", "url": "javascript:alert(1)"},
            }
        }

    def test_only_known_safe_source_ids_are_returned(self):
        raw = '{"scope":"in_scope","answer":"A grounded answer.","source_ids":["invented","page:bad","page:home"]}'
        result = app.parse_model_response(raw, self.context)
        self.assertEqual(result["answer"], "A grounded answer.")
        self.assertEqual(result["sources"], [{"title": "Home", "url": "https://ximarketing.ai/"}])

    def test_code_fenced_json_is_accepted(self):
        raw = '```json\n{"scope":"in_scope","answer":"Hello","source_ids":[]}\n```'
        self.assertEqual(app.parse_model_response(raw, self.context)["answer"], "Hello")

    def test_non_json_model_output_is_rejected(self):
        with self.assertRaises(app.PublicError):
            app.parse_model_response("A plausible but unverified answer.", self.context)

    def test_out_of_scope_answer_is_replaced_with_fixed_refusal(self):
        raw = '{"scope":"out_of_scope","answer":"Paris is the capital.","source_ids":["page:home"]}'
        result = app.parse_model_response(raw, self.context, "zh-Hans")
        self.assertEqual(result["answer"], app.OUT_OF_SCOPE_ANSWERS["zh-Hans"])
        self.assertEqual(result["sources"], [])


if __name__ == "__main__":
    unittest.main()
