import json
import io
import unittest
from types import SimpleNamespace
from unittest import mock

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


class ContactPayloadTests(unittest.TestCase):
    def valid_payload(self):
        return {
            "name": "李明",
            "email": "visitor@example.com",
            "topic": "research",
            "message": "I would like to discuss your research.",
            "website": "",
            "elapsed_ms": 4_000,
            "request_id": "123e4567-e89b-42d3-a456-426614174000",
            "locale": "zh-CN",
            "page": {"path": "/", "title": "Xi Li"},
        }

    def test_valid_contact_payload_is_normalized(self):
        result = app.validate_contact_payload(self.valid_payload())
        self.assertFalse(result["spam"])
        self.assertEqual(result["locale"], "zh-Hans")
        self.assertEqual(result["email"], "visitor@example.com")

    def test_honeypot_returns_spam_success_marker(self):
        result = app.validate_contact_payload({"website": "https://spam.example"})
        self.assertEqual(result, {"spam": True})

    def test_rejects_extra_contact_fields(self):
        payload = self.valid_payload()
        payload["to"] = "someone@example.com"
        with self.assertRaises(app.PublicError):
            app.validate_contact_payload(payload)

    def test_rejects_header_injection_in_email(self):
        payload = self.valid_payload()
        payload["email"] = "visitor@example.com\r\nBcc: attacker@example.com"
        with self.assertRaises(app.PublicError):
            app.validate_contact_payload(payload)

    def test_rejects_unknown_or_injected_topic(self):
        payload = self.valid_payload()
        payload["topic"] = "research\r\nBcc: attacker@example.com"
        with self.assertRaises(app.PublicError):
            app.validate_contact_payload(payload)

    def test_rejects_too_fast_submission(self):
        payload = self.valid_payload()
        payload["elapsed_ms"] = 500
        with self.assertRaises(app.PublicError) as raised:
            app.validate_contact_payload(payload)
        self.assertEqual(raised.exception.code, "submission_too_fast")

    def test_rejects_non_finite_elapsed_time(self):
        payload = self.valid_payload()
        payload["elapsed_ms"] = float("nan")
        with self.assertRaises(app.PublicError):
            app.validate_contact_payload(payload)


class ContactDeliveryTests(unittest.TestCase):
    def test_resend_request_uses_fixed_addresses_and_visitor_reply_to(self):
        contact = {
            "name": "Visitor",
            "email": "visitor@example.com",
            "topic": "course",
            "message": "Hello from the website.",
            "request_id": "123e4567-e89b-42d3-a456-426614174000",
            "locale": "en",
            "page": {"path": "/", "title": "Xi Li"},
        }
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"id":"email_123"}'
        app._contact_daily_budget.update({"day": "", "count": 0})

        with (
            mock.patch.object(app, "RESEND_API_KEY", "re_test"),
            mock.patch.object(app, "CONTACT_FROM_EMAIL", "Xi Li Website <website@mail.ximarketing.ai>"),
            mock.patch.object(app, "CONTACT_TO_EMAIL", "xitheory@gmail.com"),
            mock.patch("app.urllib.request.urlopen", return_value=response) as urlopen,
        ):
            app.send_contact_email(contact)

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["from"], "Xi Li Website <website@mail.ximarketing.ai>")
        self.assertEqual(payload["to"], ["xitheory@gmail.com"])
        self.assertEqual(payload["reply_to"], "visitor@example.com")
        self.assertEqual(payload["subject"], "[ximarketing.ai] Course inquiry")
        self.assertEqual(
            request.get_header("Idempotency-key"),
            "contact/123e4567-e89b-42d3-a456-426614174000",
        )

    def test_trusted_proxy_real_ip_is_used(self):
        handler = SimpleNamespace(
            client_address=("172.18.0.4", 12345),
            headers={"X-Real-IP": "203.0.113.8"},
        )
        self.assertEqual(app.get_client_ip(handler), "203.0.113.8")

    def test_untrusted_proxy_cannot_override_real_ip(self):
        handler = SimpleNamespace(
            client_address=("192.0.2.44", 12345),
            headers={"X-Real-IP": "203.0.113.8"},
        )
        self.assertEqual(app.get_client_ip(handler), "192.0.2.44")

    def test_resend_invalid_idempotency_conflict_is_not_retryable_with_same_id(self):
        contact = {
            "name": "Visitor",
            "email": "visitor@example.com",
            "topic": "other",
            "message": "A changed website message.",
            "request_id": "123e4567-e89b-42d3-a456-426614174000",
            "locale": "en",
            "page": {"path": "/", "title": "Xi Li"},
        }
        provider_error = app.urllib.error.HTTPError(
            app.RESEND_URL,
            409,
            "Conflict",
            {},
            io.BytesIO(b'{"name":"invalid_idempotent_request"}'),
        )
        app._contact_daily_budget.update({"day": "", "count": 0})
        with (
            mock.patch.object(app, "RESEND_API_KEY", "re_test"),
            mock.patch("app.urllib.request.urlopen", side_effect=provider_error),
            self.assertRaises(app.PublicError) as raised,
        ):
            app.send_contact_email(contact)
        self.assertEqual(raised.exception.status, 409)
        self.assertEqual(raised.exception.code, "idempotency_conflict")

    def test_resend_concurrent_idempotency_conflict_can_be_retried(self):
        contact = {
            "name": "Visitor",
            "email": "visitor@example.com",
            "topic": "other",
            "message": "A website message.",
            "request_id": "123e4567-e89b-42d3-a456-426614174000",
            "locale": "en",
            "page": {"path": "/", "title": "Xi Li"},
        }
        provider_error = app.urllib.error.HTTPError(
            app.RESEND_URL,
            409,
            "Conflict",
            {},
            io.BytesIO(b'{"name":"concurrent_idempotent_requests"}'),
        )
        app._contact_daily_budget.update({"day": "", "count": 0})
        with (
            mock.patch.object(app, "RESEND_API_KEY", "re_test"),
            mock.patch("app.urllib.request.urlopen", side_effect=provider_error),
            self.assertRaises(app.PublicError) as raised,
        ):
            app.send_contact_email(contact)
        self.assertEqual(raised.exception.status, 503)
        self.assertEqual(raised.exception.code, "contact_busy")


if __name__ == "__main__":
    unittest.main()
