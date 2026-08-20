#!/usr/bin/env python3
from __future__ import annotations

import crypt
import http.client
import os
import re
import tempfile
import threading
import unittest
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlencode

import portal


class PortalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.hash_path = Path(cls.tempdir.name) / "password.hash"
        cls._write_hash("Test#123")
        portal.PASSWORD_STATE = portal.PasswordState(cls.hash_path)
        portal.SESSIONS = portal.SessionStore()
        cls.server = portal.BoundedHTTPServer(("127.0.0.1", 0), portal.PortalHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.tempdir.cleanup()

    @classmethod
    def _write_hash(cls, password: str) -> None:
        value = crypt.crypt(
            password,
            crypt.mksalt(crypt.METHOD_BLOWFISH, rounds=2**12),
        )
        candidate = cls.hash_path.with_suffix(".new")
        candidate.write_text(value + "\n", encoding="ascii")
        os.replace(candidate, cls.hash_path)

    def setUp(self) -> None:
        portal.SESSIONS = portal.SessionStore()

    def request(
        self,
        method: str,
        path: str,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, list[tuple[str, str]], bytes]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=4)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        response_body = response.read()
        result = (response.status, response.getheaders(), response_body)
        connection.close()
        return result

    @staticmethod
    def header_values(headers: list[tuple[str, str]], name: str) -> list[str]:
        return [value for key, value in headers if key.lower() == name.lower()]

    def login_form(self) -> tuple[str, str, bytes]:
        status, headers, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        match = re.search(rb'name="csrf_token" value="([^"]+)"', body)
        self.assertIsNotNone(match)
        csrf_form = match.group(1).decode("ascii")
        cookies = SimpleCookie()
        for value in self.header_values(headers, "Set-Cookie"):
            cookies.load(value)
        csrf_cookie = cookies[portal.CSRF_COOKIE].value
        self.assertEqual(csrf_form, csrf_cookie)
        return csrf_form, csrf_cookie, body

    def submit(
        self,
        password: str,
        csrf_form: str,
        csrf_cookie: str,
        origin: str = portal.PUBLIC_ORIGIN,
    ) -> tuple[int, list[tuple[str, str]], bytes]:
        body = urlencode(
            {"password": password, "csrf_token": csrf_form}
        ).encode("ascii")
        return self.request(
            "POST",
            "/login",
            body,
            {
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": origin,
                "Sec-Fetch-Site": "same-origin",
                "Cookie": f"{portal.CSRF_COOKIE}={csrf_cookie}",
            },
        )

    def test_form_has_only_one_visible_password_field(self) -> None:
        _, _, body = self.login_form()
        self.assertEqual(body.count(b'type="password"'), 1)
        self.assertNotIn(b'name="username"', body)
        self.assertIn(b'autocomplete="current-password"', body)

    def test_wrong_password_is_generic_and_has_no_basic_challenge(self) -> None:
        csrf_form, csrf_cookie, _ = self.login_form()
        status, headers, body = self.submit("Wrong#12", csrf_form, csrf_cookie)
        self.assertEqual(status, 401)
        self.assertFalse(self.header_values(headers, "WWW-Authenticate"))
        self.assertIn(b"The password is incorrect", body)
        self.assertNotIn(b"Wrong#12", body)

    def test_login_sets_secure_session_and_serves_private_page(self) -> None:
        csrf_form, csrf_cookie, _ = self.login_form()
        status, headers, body = self.submit("Test#123", csrf_form, csrf_cookie)
        self.assertEqual(status, 303)
        self.assertEqual(body, b"")
        cookies = self.header_values(headers, "Set-Cookie")
        session_header = next(value for value in cookies if portal.SESSION_COOKIE in value)
        self.assertIn("Secure", session_header)
        self.assertIn("HttpOnly", session_header)
        self.assertIn("SameSite=Strict", session_header)
        session_cookie = SimpleCookie()
        session_cookie.load(session_header)
        token = session_cookie[portal.SESSION_COOKIE].value

        status, _, page = self.request(
            "GET",
            "/",
            headers={"Cookie": f"{portal.SESSION_COOKIE}={token}"},
        )
        self.assertEqual(status, 200)
        self.assertIn(b'action="/logout"', page)
        self.assertNotIn(b'name="password"', page)

    def test_logout_revokes_session_and_clears_cookies(self) -> None:
        csrf_form, csrf_cookie, _ = self.login_form()
        status, headers, _ = self.submit("Test#123", csrf_form, csrf_cookie)
        self.assertEqual(status, 303)
        session_header = next(
            value
            for value in self.header_values(headers, "Set-Cookie")
            if portal.SESSION_COOKIE in value
        )
        session_cookie = SimpleCookie()
        session_cookie.load(session_header)
        token = session_cookie[portal.SESSION_COOKIE].value

        status, headers, private_page = self.request(
            "GET",
            "/",
            headers={"Cookie": f"{portal.SESSION_COOKIE}={token}"},
        )
        self.assertEqual(status, 200)
        match = re.search(rb'name="csrf_token" value="([^"]+)"', private_page)
        self.assertIsNotNone(match)
        logout_csrf = match.group(1).decode("ascii")
        cookies = SimpleCookie()
        for value in self.header_values(headers, "Set-Cookie"):
            cookies.load(value)
        csrf_cookie = cookies[portal.CSRF_COOKIE].value
        logout_body = urlencode({"csrf_token": logout_csrf}).encode("ascii")
        status, headers, _ = self.request(
            "POST",
            "/logout",
            logout_body,
            {
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": portal.PUBLIC_ORIGIN,
                "Sec-Fetch-Site": "same-origin",
                "Cookie": (
                    f"{portal.SESSION_COOKIE}={token}; "
                    f"{portal.CSRF_COOKIE}={csrf_cookie}"
                ),
            },
        )
        self.assertEqual(status, 303)
        self.assertEqual(self.header_values(headers, "Location"), ["/login"])
        self.assertTrue(
            any("Max-Age=0" in value for value in self.header_values(headers, "Set-Cookie"))
        )

        status, _, page = self.request(
            "GET",
            "/",
            headers={"Cookie": f"{portal.SESSION_COOKIE}={token}"},
        )
        self.assertEqual(status, 200)
        self.assertIn(b'name="password"', page)

    def test_password_change_revokes_existing_session(self) -> None:
        csrf_form, csrf_cookie, _ = self.login_form()
        status, headers, _ = self.submit("Test#123", csrf_form, csrf_cookie)
        self.assertEqual(status, 303)
        session_header = next(
            value
            for value in self.header_values(headers, "Set-Cookie")
            if portal.SESSION_COOKIE in value
        )
        session_cookie = SimpleCookie()
        session_cookie.load(session_header)
        token = session_cookie[portal.SESSION_COOKIE].value

        self._write_hash("Next#456")
        status, _, body = self.request(
            "GET",
            "/",
            headers={"Cookie": f"{portal.SESSION_COOKIE}={token}"},
        )
        self.assertEqual(status, 200)
        self.assertIn(b'name="password"', body)
        self._write_hash("Test#123")

    def test_cross_origin_and_bad_csrf_are_rejected(self) -> None:
        csrf_form, csrf_cookie, _ = self.login_form()
        status, _, _ = self.submit(
            "Test#123",
            csrf_form,
            csrf_cookie,
            origin="https://example.com",
        )
        self.assertEqual(status, 400)

        csrf_form, csrf_cookie, _ = self.login_form()
        status, _, _ = self.submit("Test#123", csrf_form + "x", csrf_cookie)
        self.assertEqual(status, 400)

        status, _, _ = self.submit("Test#123", "测" * 32, csrf_cookie)
        self.assertEqual(status, 400)

    def test_bcrypt_length_limit_and_multitab_csrf_reuse(self) -> None:
        first_form, first_cookie, _ = self.login_form()
        status, second_headers, second_body = self.request(
            "GET",
            "/",
            headers={"Cookie": f"{portal.CSRF_COOKIE}={first_cookie}"},
        )
        self.assertEqual(status, 200)
        second_match = re.search(rb'name="csrf_token" value="([^"]+)"', second_body)
        self.assertIsNotNone(second_match)
        self.assertEqual(second_match.group(1).decode("ascii"), first_form)
        second_cookies = SimpleCookie()
        for value in self.header_values(second_headers, "Set-Cookie"):
            second_cookies.load(value)
        self.assertEqual(second_cookies[portal.CSRF_COOKIE].value, first_cookie)

        status, _, body = self.submit("A" * 73, first_form, first_cookie)
        self.assertEqual(status, 401)
        self.assertIn(b"The password is incorrect", body)

    def test_health_is_local_only(self) -> None:
        status, _, body = self.request("GET", "/healthz")
        self.assertEqual(status, 204)
        self.assertEqual(body, b"")


if __name__ == "__main__":
    unittest.main(verbosity=2)
