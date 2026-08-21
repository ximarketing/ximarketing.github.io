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
        origin: str | None = portal.PUBLIC_ORIGIN,
        fetch_site: str | None = "same-origin",
        referer: str | None = None,
        next_path: str = "",
    ) -> tuple[int, list[tuple[str, str]], bytes]:
        fields = {"password": password, "csrf_token": csrf_form}
        if next_path:
            fields["next"] = next_path
        body = urlencode(fields).encode("ascii")
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": f"{portal.CSRF_COOKIE}={csrf_cookie}",
        }
        if origin is not None:
            headers["Origin"] = origin
        if fetch_site is not None:
            headers["Sec-Fetch-Site"] = fetch_site
        if referer is not None:
            headers["Referer"] = referer
        return self.request(
            "POST",
            "/login",
            body,
            headers,
        )

    def test_form_has_only_one_visible_password_field(self) -> None:
        _, _, body = self.login_form()
        self.assertEqual(body.count(b'type="password"'), 1)
        self.assertNotIn(b'name="username"', body)
        self.assertIn(b'autocomplete="current-password"', body)
        self.assertIn(b'aria-label="Primary navigation"', body)
        self.assertIn(b'href="https://ximarketing.ai/research/"', body)
        self.assertIn(b'href="https://ximarketing.ai/teaching/"', body)
        self.assertIn(b'href="https://ximarketing.ai/#media"', body)
        self.assertIn(b'href="https://ximarketing.ai/contact/"', body)
        self.assertIn(b'aria-current="page"', body)
        self.assertIn(b'data-i18n="navigation.intranet">Intranet</a>', body)
        self.assertIn(b'data-language-switcher', body)
        self.assertIn(b'id="theme-toggle"', body)
        self.assertIn(b'id="site-nav"', body)
        self.assertIn(b'class="nav-toggle"', body)
        self.assertIn(b'class="hidden-links hidden"', body)
        self.assertIn(b'src="/intranet-bootstrap.js"', body)
        self.assertIn(b'src="/intranet.js"', body)
        self.assertIn(b'data-intranet-language-root', body)
        self.assertNotIn(b"Negotiation Games", body)

    def test_language_assets_and_query_routes_are_available(self) -> None:
        status, headers, bootstrap = self.request("GET", "/intranet-bootstrap.js")
        self.assertEqual(status, 200)
        self.assertIn("application/javascript", self.header_values(headers, "Content-Type")[0])
        self.assertIn(b"prefers-color-scheme: dark", bootstrap)
        self.assertIn(b"xi-language", bootstrap)

        status, headers, script = self.request("GET", "/intranet.js")
        self.assertEqual(status, 200)
        self.assertIn("application/javascript", self.header_values(headers, "Content-Type")[0])
        self.assertIn("内网".encode("utf-8"), script)
        self.assertIn("內網".encode("utf-8"), script)
        self.assertIn(b"data-language-forward", script)
        self.assertNotIn(b"Negotiation Games", script)
        self.assertNotIn(b"AI Negotiation Arena", script)
        self.assertNotIn(b"/games/negotiation/", script)

        status, headers, css = self.request("GET", "/login.css")
        self.assertEqual(status, 200)
        self.assertIn("text/css", self.header_values(headers, "Content-Type")[0])
        self.assertIn(b"font-size: 14px", css)
        self.assertIn(b"max-width: 1180px", css)

        status, _, body = self.request("GET", "/?lang=zh-Hans")
        self.assertEqual(status, 200)
        self.assertIn(b'data-language-option="zh-Hans"', body)
        anonymous_payload = bootstrap + script + body
        for game in portal.GAMES:
            for value in game.values():
                self.assertNotIn(value.encode("utf-8"), anonymous_payload)
        for tool in portal.TOOLS:
            for value in tool.values():
                self.assertNotIn(value.encode("utf-8"), anonymous_payload)
        self.assertNotIn("Open game →".encode("utf-8"), anonymous_payload)
        self.assertNotIn("Open tool →".encode("utf-8"), anonymous_payload)

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
        self.assertIn(b'data-zh-hans="\xe6\xb8\xb8\xe6\x88\x8f"', page)
        self.assertIn(b'data-zh-hant="\xe9\x81\x8a\xe6\x88\xb2"', page)
        self.assertIn(b"Negotiation Games", page)
        self.assertIn(b"AI Negotiation Arena", page)
        self.assertIn(b"Host or join an interactive negotiation session.", page)
        self.assertIn("谈判游戏".encode("utf-8"), page)
        self.assertIn("談判遊戲".encode("utf-8"), page)
        self.assertIn(b'href="/games/negotiation/"', page)
        self.assertIn(b"A/B Test Showdown", page)
        self.assertIn(b"Experimentation Game", page)
        self.assertIn(b'href="/games/ab-test/"', page)
        self.assertIn("A/B 测试擂台".encode("utf-8"), page)
        self.assertIn("A/B 測試擂臺".encode("utf-8"), page)
        self.assertIn(b"Haggle Arena", page)
        self.assertIn(b"AI Haggling Game", page)
        self.assertIn(
            b"Negotiate with an AI seller and compete for the lowest price.",
            page,
        )
        self.assertIn(b'href="/games/haggle/host.html"', page)
        self.assertIn("AI 砍价竞技场".encode("utf-8"), page)
        self.assertIn("AI 議價競技場".encode("utf-8"), page)
        self.assertIn(b'data-i18n="private.logout"', page)
        self.assertIn(b'id="games-title"', page)
        self.assertIn(b'<h1 class="private-section__title" id="games-title"', page)
        self.assertNotIn(b'<h1 id="intranet-title"', page)
        self.assertIn(b'<h2 data-i18n="games.negotiation.title"', page)
        self.assertIn(b'id="tools-title"', page)
        self.assertIn(b'<h3 data-i18n="tools.classroom-picker.title"', page)
        self.assertIn(b"Classroom Random Picker", page)
        self.assertIn(b"Teaching Tool", page)
        self.assertIn(b'href="/tools/classroom-picker/host"', page)
        self.assertIn("课堂随机抽选".encode("utf-8"), page)
        self.assertIn("課堂隨機抽選".encode("utf-8"), page)

    def test_games_renderer_is_scalable_and_escapes_content(self) -> None:
        rendered = portal._games_html(
            (
                {
                    "id": "one",
                    "title": "One < Two",
                    "eyebrow": "Test & Learn",
                    "description": 'A "new" game',
                    "url": "/games/one/",
                },
                {
                    "id": "second",
                    "title": "Second Game",
                    "eyebrow": "Simulation",
                    "description": "Another game",
                    "url": "/games/second/",
                },
            )
        )
        self.assertEqual(rendered.count('class="game-card"'), 2)
        self.assertIn("One &lt; Two", rendered)
        self.assertIn("Test &amp; Learn", rendered)
        self.assertIn("A &quot;new&quot; game", rendered)

        hosted = portal._games_html(
            (
                {
                    "id": "hosted",
                    "title": "Hosted Game",
                    "eyebrow": "Protected Host",
                    "description": "Players enter through an invitation.",
                    "url": "/games/hosted/host.html",
                },
            )
        )
        self.assertIn('href="/games/hosted/host.html"', hosted)

        with self.assertRaises(ValueError):
            portal._games_html(
                (
                    {
                        "id": "one",
                        "title": "One",
                        "eyebrow": "Test",
                        "description": "Query strings are not allowed",
                        "url": "/games/one/?mode=host",
                    },
                )
            )

        with self.assertRaises(ValueError):
            portal._games_html(
                (
                    {
                        "id": "one",
                        "title": "One",
                        "eyebrow": "Test",
                        "description": "Player pages are not portal entries",
                        "url": "/games/one/play.html",
                    },
                )
            )

        with self.assertRaises(ValueError):
            portal._games_html(
                (
                    {
                        "id": "unsafe",
                        "title": "Unsafe",
                        "eyebrow": "Unsafe",
                        "description": "Unsafe",
                        "url": "https://example.com/game",
                    },
                )
            )

        with self.assertRaises(ValueError):
            portal._games_html(
                (
                    {
                        "id": "../unsafe",
                        "title": "Unsafe",
                        "eyebrow": "Unsafe",
                        "description": "Unsafe",
                        "url": "/games/unsafe/",
                    },
                )
            )

        rendered = portal._tools_html(
            (
                {
                    "id": "classroom-picker",
                    "title": "Picker < Tool",
                    "eyebrow": "Teaching & Learning",
                    "description": 'Pick a "participant"',
                    "url": "/tools/classroom-picker/host",
                },
            )
        )
        self.assertIn("Picker &lt; Tool", rendered)
        self.assertIn("Teaching &amp; Learning", rendered)
        self.assertIn("Pick a &quot;participant&quot;", rendered)
        self.assertIn("Open tool →", rendered)

        with self.assertRaises(ValueError):
            portal._tools_html(
                (
                    {
                        "id": "classroom-picker",
                        "title": "Unsafe",
                        "eyebrow": "Unsafe",
                        "description": "Unsafe",
                        "url": "/tools/classroom-picker/#/student-data",
                    },
                )
            )

    def test_gateway_auth_check_requires_internal_marker_and_valid_session(self) -> None:
        status, _, _ = self.request("GET", "/__auth/check")
        self.assertEqual(status, 404)

        status, _, body = self.request(
            "GET",
            "/__auth/check",
            headers={"X-Intranet-Auth-Check": "gateway"},
        )
        self.assertEqual(status, 401)
        self.assertEqual(body, b"")

        status, headers, body = self.request(
            "GET",
            "/__auth/check",
            headers={
                "X-Intranet-Auth-Check": "gateway",
                "X-Forwarded-Method": "GET",
                "X-Forwarded-Uri": "/games/haggle/host.html",
            },
        )
        self.assertEqual(status, 303)
        self.assertEqual(
            self.header_values(headers, "Location"),
            ["/login?next=/games/haggle/host.html"],
        )
        self.assertEqual(body, b"")

        status, headers, body = self.request(
            "GET",
            "/__auth/check",
            headers={
                "X-Intranet-Auth-Check": "gateway",
                "X-Forwarded-Method": "GET",
                "X-Forwarded-Uri": "/games/ab-test/host.html",
            },
        )
        self.assertEqual(status, 303)
        self.assertEqual(
            self.header_values(headers, "Location"),
            ["/login?next=/games/ab-test/host.html"],
        )
        self.assertEqual(body, b"")

        status, headers, body = self.request(
            "GET",
            "/__auth/check",
            headers={
                "X-Intranet-Auth-Check": "gateway",
                "X-Forwarded-Method": "GET",
                "X-Forwarded-Uri": "/tools/classroom-picker/",
            },
        )
        self.assertEqual(status, 401)
        self.assertEqual(body, b"")

        status, headers, body = self.request(
            "GET",
            "/__auth/check",
            headers={
                "X-Intranet-Auth-Check": "gateway",
                "X-Forwarded-Method": "GET",
                "X-Forwarded-Uri": "/games/ab-test/play.html",
            },
        )
        self.assertEqual(status, 401)
        self.assertEqual(body, b"")

        status, _, body = self.request(
            "GET",
            "/__auth/check",
            headers={
                "X-Intranet-Auth-Check": "gateway",
                "X-Forwarded-Method": "GET",
                "X-Forwarded-Uri": "/games/negotiation/api/rooms/123456",
            },
        )
        self.assertEqual(status, 401)
        self.assertEqual(body, b"")

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

        status, _, body = self.request(
            "GET",
            "/__auth/check",
            headers={
                "X-Intranet-Auth-Check": "gateway",
                "X-Forwarded-Method": "GET",
                "X-Forwarded-Uri": "/games/ab-test/host.html",
                "Cookie": f"{portal.SESSION_COOKIE}={token}",
            },
        )
        self.assertEqual(status, 204)
        self.assertEqual(body, b"")

        status, _, body = self.request(
            "GET",
            "/__auth/check",
            headers={
                "X-Intranet-Auth-Check": "gateway",
                "X-Forwarded-Method": "GET",
                "X-Forwarded-Uri": "/games/haggle/host.html",
                "Cookie": f"{portal.SESSION_COOKIE}={token}",
            },
        )
        self.assertEqual(status, 204)
        self.assertEqual(body, b"")

    def test_game_login_returns_to_safe_entry_without_open_redirect(self) -> None:
        status, _, body = self.request(
            "GET",
            "/login?next=%2Fgames%2Fab-test%2Fhost.html",
        )
        self.assertEqual(status, 200)
        self.assertIn(
            b'name="next" value="/games/ab-test/host.html"',
            body,
        )
        match = re.search(rb'name="csrf_token" value="([^"]+)"', body)
        self.assertIsNotNone(match)
        csrf_form = match.group(1).decode("ascii")
        status, headers, body = self.request(
            "GET",
            "/login?next=https%3A%2F%2Fexample.com%2F",
        )
        self.assertEqual(status, 200)
        self.assertNotIn(b'name="next"', body)

        csrf_cookie = SimpleCookie()
        status, login_headers, _ = self.request(
            "GET",
            "/login?next=%2Fgames%2Fab-test%2Fhost.html",
        )
        self.assertEqual(status, 200)
        for value in self.header_values(login_headers, "Set-Cookie"):
            csrf_cookie.load(value)
        csrf_value = csrf_cookie[portal.CSRF_COOKIE].value
        status, headers, _ = self.submit(
            "Test#123",
            csrf_value,
            csrf_value,
            next_path="/games/ab-test/host.html",
        )
        self.assertEqual(status, 303)
        self.assertEqual(
            self.header_values(headers, "Location"),
            ["/games/ab-test/host.html"],
        )

        status, _, body = self.request(
            "GET",
            "/login?next=%2Fgames%2Fhaggle%2Fhost.html",
        )
        self.assertEqual(status, 200)
        self.assertIn(
            b'name="next" value="/games/haggle/host.html"',
            body,
        )
        csrf_cookie = SimpleCookie()
        status, login_headers, _ = self.request(
            "GET",
            "/login?next=%2Fgames%2Fhaggle%2Fhost.html",
        )
        self.assertEqual(status, 200)
        for value in self.header_values(login_headers, "Set-Cookie"):
            csrf_cookie.load(value)
        csrf_value = csrf_cookie[portal.CSRF_COOKIE].value
        status, headers, _ = self.submit(
            "Test#123",
            csrf_value,
            csrf_value,
            next_path="/games/haggle/host.html",
        )
        self.assertEqual(status, 303)
        self.assertEqual(
            self.header_values(headers, "Location"),
            ["/games/haggle/host.html"],
        )

        csrf_form, csrf_value, _ = self.login_form()
        status, _, _ = self.submit(
            "Test#123",
            csrf_form,
            csrf_value,
            next_path="//example.com/steal",
        )
        self.assertEqual(status, 400)

        status, _, body = self.request(
            "GET",
            "/login?next=%2Ftools%2Fclassroom-picker%2F",
        )
        self.assertEqual(status, 200)
        self.assertNotIn(b'name="next"', body)

        status, _, body = self.request(
            "GET",
            "/login?next=%2Ftools%2Fclassroom-picker%2Fhost",
        )
        self.assertEqual(status, 200)
        self.assertIn(
            b'name="next" value="/tools/classroom-picker/host"',
            body,
        )
        csrf_cookie = SimpleCookie()
        status, login_headers, _ = self.request(
            "GET",
            "/login?next=%2Ftools%2Fclassroom-picker%2Fhost",
        )
        self.assertEqual(status, 200)
        for value in self.header_values(login_headers, "Set-Cookie"):
            csrf_cookie.load(value)
        csrf_value = csrf_cookie[portal.CSRF_COOKIE].value
        status, headers, _ = self.submit(
            "Test#123",
            csrf_value,
            csrf_value,
            next_path="/tools/classroom-picker/host",
        )
        self.assertEqual(status, 303)
        self.assertEqual(
            self.header_values(headers, "Location"),
            ["/tools/classroom-picker/host"],
        )

        for unsafe_next in (
            "/games/negotiation/",
            "/games/ab-test/play.html",
            "/games/haggle/play.html",
            "/games/haggle/api/player/events",
            "/tools/classroom-picker/",
            "/tools/classroom-picker/api/state",
            "/tools/classroom-picker/assets/index.js",
            "/tools/another-tool/",
            "//example.com/steal",
        ):
            self.assertEqual(portal._safe_protected_entry_path(unsafe_next), "")

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

    def test_embedded_browser_same_origin_metadata_is_accepted(self) -> None:
        csrf_form, csrf_cookie, _ = self.login_form()
        status, _, body = self.submit(
            "Wrong#12",
            csrf_form,
            csrf_cookie,
            fetch_site="none",
        )
        self.assertEqual(status, 401)
        self.assertIn(b"The password is incorrect", body)

        csrf_form, csrf_cookie, _ = self.login_form()
        status, _, body = self.submit(
            "Wrong#12",
            csrf_form,
            csrf_cookie,
            origin=None,
            fetch_site="none",
            referer=f"{portal.PUBLIC_ORIGIN}/login",
        )
        self.assertEqual(status, 401)
        self.assertIn(b"The password is incorrect", body)

        csrf_form, csrf_cookie, _ = self.login_form()
        status, _, _ = self.submit(
            "Test#123",
            csrf_form,
            csrf_cookie,
            origin=None,
            fetch_site="none",
        )
        self.assertEqual(status, 400)

        csrf_form, csrf_cookie, _ = self.login_form()
        status, _, _ = self.submit(
            "Test#123",
            csrf_form,
            csrf_cookie,
            fetch_site="cross-site",
        )
        self.assertEqual(status, 400)

        csrf_form, csrf_cookie, _ = self.login_form()
        status, _, _ = self.submit(
            "Test#123",
            csrf_form,
            csrf_cookie,
            origin=None,
            fetch_site="none",
            referer="https://example.com/login",
        )
        self.assertEqual(status, 400)

        csrf_form, csrf_cookie, _ = self.login_form()
        status, _, _ = self.submit(
            "Test#123",
            csrf_form,
            csrf_cookie,
            origin="null",
            fetch_site="none",
        )
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
