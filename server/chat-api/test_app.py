import base64
import io
import json
import unittest
from types import SimpleNamespace
from unittest import mock

import app


VALID_PDF = b"%PDF-1.7\nminimal test document\n%%EOF"
VALID_JPEG = b"\xff\xd8\xff\xe0minimal jpeg\xff\xd9"
VALID_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


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
        self.assertIsNone(result["attachment"])

    def test_allowed_attachment_types_are_normalized(self):
        cases = (
            ("research-proposal.pdf", VALID_PDF, ".pdf", "application/pdf"),
            ("photo.jpg", VALID_JPEG, ".jpg", "image/jpeg"),
            ("photo.JPEG", VALID_JPEG, ".jpeg", "image/jpeg"),
            ("chart.png", VALID_PNG, ".png", "image/png"),
        )
        for filename, content, extension, content_type in cases:
            with self.subTest(filename=filename):
                payload = self.valid_payload()
                payload["attachment"] = {
                    "filename": filename,
                    "content": base64.b64encode(content).decode("ascii"),
                }
                result = app.validate_contact_payload(payload)["attachment"]
                self.assertEqual(result["filename"], filename)
                self.assertEqual(result["extension"], extension)
                self.assertEqual(result["content_type"], content_type)
                self.assertEqual(result["size"], len(content))

    def test_attachment_at_exact_two_megabyte_limit_is_allowed(self):
        suffix = b"\n%%EOF"
        content = (
            b"%PDF-1.7\n"
            + b"0" * (app.MAX_ATTACHMENT_BYTES - len(b"%PDF-1.7\n") - len(suffix))
            + suffix
        )
        result = app.validate_contact_attachment(
            {
                "filename": "large-proposal.pdf",
                "content": base64.b64encode(content).decode("ascii"),
            }
        )
        self.assertEqual(result["size"], app.MAX_ATTACHMENT_BYTES)

    def test_rejects_attachment_over_two_megabytes(self):
        suffix = b"\n%%EOF"
        content = (
            b"%PDF-1.7\n"
            + b"0" * (app.MAX_ATTACHMENT_BYTES + 1 - len(b"%PDF-1.7\n") - len(suffix))
            + suffix
        )
        payload = self.valid_payload()
        payload["attachment"] = {
            "filename": "large.pdf",
            "content": base64.b64encode(content).decode("ascii"),
        }
        with self.assertRaises(app.PublicError) as raised:
            app.validate_contact_payload(payload)
        self.assertEqual(raised.exception.status, 413)
        self.assertEqual(raised.exception.code, "attachment_too_large")

    def test_rejects_disallowed_or_disguised_attachment(self):
        for filename, content in (
            ("script.exe", b"MZ"),
            ("disguised.pdf", b"MZ executable"),
            ("truncated.pdf", b"%PDF-1.7\nmissing end marker"),
            ("../proposal.pdf", VALID_PDF),
            ("proposal\u202efdp.pdf", VALID_PDF),
            ("fake.png", VALID_JPEG),
        ):
            with self.subTest(filename=filename):
                payload = self.valid_payload()
                payload["attachment"] = {
                    "filename": filename,
                    "content": base64.b64encode(content).decode("ascii"),
                }
                with self.assertRaises(app.PublicError):
                    app.validate_contact_payload(payload)

    def test_rejects_invalid_attachment_base64(self):
        for content in ("", "not base64!", "data:application/pdf;base64,JVBERi0x"):
            with self.subTest(content=content):
                payload = self.valid_payload()
                payload["attachment"] = {"filename": "proposal.pdf", "content": content}
                with self.assertRaises(app.PublicError) as raised:
                    app.validate_contact_payload(payload)
                self.assertEqual(raised.exception.code, "invalid_attachment")

    def test_rejects_invalid_attachment_shape(self):
        for attachment in (
            [],
            {"filename": "proposal.pdf"},
            {
                "filename": "proposal.pdf",
                "content": base64.b64encode(VALID_PDF).decode("ascii"),
                "extra": "not allowed",
            },
        ):
            with self.subTest(attachment=attachment):
                payload = self.valid_payload()
                payload["attachment"] = attachment
                with self.assertRaises(app.PublicError) as raised:
                    app.validate_contact_payload(payload)
                self.assertEqual(raised.exception.code, "invalid_attachment")

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
    def test_application_topic_uses_phd_ra_label(self):
        contact = {
            "name": "Visitor",
            "email": "visitor@example.com",
            "topic": "application",
            "message": "I would like to ask about research opportunities.",
            "request_id": "123e4567-e89b-42d3-a456-426614174000",
            "locale": "en",
            "page": {"path": "/contact/", "title": "Contact Xi Li"},
        }
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"id":"email_123"}'
        app._contact_daily_budget.update({"day": "", "count": 0})

        with (
            mock.patch.object(app, "RESEND_API_KEY", "re_test"),
            mock.patch("app.urllib.request.urlopen", return_value=response) as urlopen,
        ):
            app.send_contact_email(contact)

        payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(payload["subject"], "[ximarketing.ai] PhD / RA Application")
        self.assertIn("Type: PhD / RA Application", payload["text"])

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
        self.assertNotIn("attachments", payload)
        self.assertEqual(
            request.get_header("Idempotency-key"),
            "contact/123e4567-e89b-42d3-a456-426614174000",
        )

    def test_resend_request_includes_validated_attachment(self):
        content = VALID_PDF
        attachment = app.validate_contact_attachment(
            {
                "filename": "proposal.pdf",
                "content": base64.b64encode(content).decode("ascii"),
            }
        )
        contact = {
            "name": "Visitor",
            "email": "visitor@example.com",
            "topic": "research",
            "message": "Please see the attached proposal.",
            "request_id": "123e4567-e89b-42d3-a456-426614174000",
            "locale": "en",
            "page": {"path": "/", "title": "Xi Li"},
            "attachment": attachment,
        }
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"id":"email_123"}'
        app._contact_daily_budget.update({"day": "", "count": 0})
        with (
            mock.patch.object(app, "RESEND_API_KEY", "re_test"),
            mock.patch("app.urllib.request.urlopen", return_value=response) as urlopen,
        ):
            app.send_contact_email(contact)

        payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(
            payload["attachments"],
            [
                {
                    "filename": "attachment-123e4567.pdf",
                    "content": base64.b64encode(content).decode("ascii"),
                }
            ],
        )
        self.assertIn("Attachment: proposal.pdf", payload["text"])

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


class ContactHandlerTests(unittest.TestCase):
    def test_rate_limit_and_contact_slot_precede_body_read(self):
        events = []
        handler = object.__new__(app.ChatHandler)
        handler.path = "/api/contact"
        handler._origin_allowed = mock.Mock(return_value=True)
        handler._read_json_body = mock.Mock(
            side_effect=lambda maximum: events.append(("read", maximum)) or {}
        )
        handler._json_response = mock.Mock(
            side_effect=lambda status, payload: events.append(("response", status, payload))
        )
        slots = mock.Mock()
        slots.acquire.side_effect = lambda blocking: events.append(("acquire", blocking)) or True
        slots.release.side_effect = lambda: events.append(("release",))

        with (
            mock.patch("app.get_client_ip", return_value="203.0.113.8"),
            mock.patch(
                "app.is_contact_rate_limited",
                side_effect=lambda _ip: events.append(("rate_limit",)) or False,
            ),
            mock.patch.object(app, "_contact_slots", slots),
            mock.patch(
                "app.validate_contact_payload",
                side_effect=lambda _payload: events.append(("validate",)) or {"spam": False},
            ),
            mock.patch(
                "app.send_contact_email",
                side_effect=lambda _contact: events.append(("send",)),
            ),
        ):
            app.ChatHandler.do_POST(handler)

        self.assertEqual(
            events,
            [
                ("rate_limit",),
                ("acquire", False),
                ("read", app.MAX_CONTACT_BODY_BYTES),
                ("validate",),
                ("send",),
                ("release",),
                ("response", 200, {"ok": True}),
            ],
        )

    def test_busy_contact_slot_rejects_before_body_read(self):
        handler = object.__new__(app.ChatHandler)
        handler.path = "/api/contact"
        handler._origin_allowed = mock.Mock(return_value=True)
        handler._read_json_body = mock.Mock()
        handler._json_response = mock.Mock()
        slots = mock.Mock()
        slots.acquire.return_value = False

        with (
            mock.patch("app.get_client_ip", return_value="203.0.113.8"),
            mock.patch("app.is_contact_rate_limited", return_value=False),
            mock.patch.object(app, "_contact_slots", slots),
        ):
            app.ChatHandler.do_POST(handler)

        handler._read_json_body.assert_not_called()
        slots.release.assert_not_called()
        handler._json_response.assert_called_once_with(503, {"error": "contact_unavailable"})


if __name__ == "__main__":
    unittest.main()
