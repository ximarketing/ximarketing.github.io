#!/usr/bin/env python3
"""Minimal password-only form portal for Xi Li's private site."""

from __future__ import annotations

import crypt
import hashlib
import hmac
import html
import os
import re
import secrets
import sys
import threading
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8080
PUBLIC_ORIGIN = os.environ.get(
    "INTRANET_PUBLIC_ORIGIN", "https://intranet.ximarketing.ai"
)
PASSWORD_HASH_FILE = Path(
    os.environ.get(
        "INTRANET_PASSWORD_HASH_FILE",
        "/run/intranet-secrets/password.hash",
    )
)
SESSION_TTL_SECONDS = 12 * 60 * 60
CSRF_TTL_SECONDS = 10 * 60
MAX_SESSIONS = 256
MAX_FORM_BYTES = 1024
MAX_COOKIE_BYTES = 4096
MAX_CONCURRENT_REQUESTS = 12
SESSION_COOKIE = "__Host-intranet_session"
CSRF_COOKIE = "__Host-intranet_csrf"
BCRYPT_RE = re.compile(r"^\$2[aby]\$12\$[./A-Za-z0-9]{53}$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


LOGIN_CSS = b"""
:root {
  color-scheme: light;
  font-family: Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif;
  background: #f9fafb;
  color: #182630;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: #f9fafb; }
body { min-height: 100svh; }
.login-page {
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 40px 24px;
}
.login-panel { width: min(100%, 30rem); }
h1 {
  margin: 0 0 14px;
  font-size: clamp(2.4rem, 8vw, 4rem);
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: -0.025em;
}
.login-intro {
  margin: 0 0 32px;
  color: #60727f;
  font-size: 1.15rem;
  line-height: 1.55;
}
label {
  display: block;
  margin-bottom: 9px;
  font-size: 1rem;
  font-weight: 700;
}
input {
  display: block;
  width: 100%;
  min-height: 52px;
  padding: 12px 15px;
  border: 1px solid #c8d5de;
  border-radius: 10px;
  color: #182630;
  background: #f9fafb;
  font: 1.1rem/1.25 Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif;
  outline: none;
}
input:focus {
  border-color: #3f6482;
  box-shadow: 0 0 0 3px rgba(63, 100, 130, 0.18);
}
input[aria-invalid="true"] { border-color: #9d3d3d; }
.login-error {
  margin: 10px 0 0;
  color: #8b3030;
  font-size: 0.98rem;
  line-height: 1.45;
}
button {
  width: 100%;
  min-height: 52px;
  margin-top: 22px;
  padding: 12px 18px;
  border: 1px solid #31536d;
  border-radius: 10px;
  color: #fff;
  background: #31536d;
  font: 700 1.05rem/1.2 Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif;
  cursor: pointer;
}
button:hover { background: #29485f; }
button:focus-visible {
  outline: 3px solid rgba(63, 100, 130, 0.35);
  outline-offset: 3px;
}
.private-page { min-height: 100svh; }
.logout-form { position: fixed; top: 24px; right: 24px; }
.logout-form button {
  width: auto;
  min-height: 44px;
  margin: 0;
  padding: 9px 16px;
  color: #31536d;
  background: transparent;
}
.logout-form button:hover { color: #fff; background: #31536d; }
@media (max-width: 480px) {
  .login-page { place-items: start center; padding-top: 18vh; }
  .login-intro { margin-bottom: 26px; }
  .logout-form { top: 16px; right: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; }
}
""".strip()


def _login_html(csrf_token: str, error: str | None = None) -> bytes:
    error_markup = ""
    invalid = "false"
    described_by = ""
    if error:
        invalid = "true"
        described_by = ' aria-describedby="password-error"'
        error_markup = (
            '<p class="login-error" id="password-error" role="alert">'
            f"{html.escape(error)}"
            "</p>"
        )

    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Intranet · Xi Li</title>
  <link rel="stylesheet" href="/login.css">
</head>
<body>
  <main class="login-page">
    <section class="login-panel" aria-labelledby="login-title">
      <h1 id="login-title">Intranet</h1>
      <p class="login-intro">Enter the access password to continue.</p>
      <form action="/login" method="post">
        <input type="hidden" name="csrf_token" value="{html.escape(csrf_token)}">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required
               maxlength="72" autocomplete="current-password"
               autocapitalize="none" spellcheck="false" enterkeyhint="go"
               aria-invalid="{invalid}"{described_by}>
        {error_markup}
        <button type="submit">Continue</button>
      </form>
    </section>
  </main>
</body>
</html>"""
    return document.encode("utf-8")


def _private_html(csrf_token: str) -> bytes:
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Intranet · Xi Li</title>
  <link rel="stylesheet" href="/login.css">
</head>
<body class="private-page">
  <main aria-label="Intranet"></main>
  <form class="logout-form" action="/logout" method="post">
    <input type="hidden" name="csrf_token" value="{html.escape(csrf_token)}">
    <button type="submit">Log out</button>
  </form>
</body>
</html>"""
    return document.encode("utf-8")


class PasswordState:
    """Reads the bcrypt hash and exposes a stable revocation fingerprint."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._signature: tuple[int, int, int] | None = None
        self._hash = ""
        self._fingerprint = ""

    def current(self) -> tuple[str, str]:
        stat = self.path.stat()
        signature = (stat.st_ino, stat.st_mtime_ns, stat.st_size)
        with self._lock:
            if signature != self._signature:
                value = self.path.read_text(encoding="ascii").strip()
                if not BCRYPT_RE.fullmatch(value):
                    raise ValueError("invalid bcrypt hash file")
                self._hash = value
                self._fingerprint = hashlib.sha256(value.encode("ascii")).hexdigest()
                self._signature = signature
            return self._hash, self._fingerprint


class SessionStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, tuple[float, str]] = {}

    @staticmethod
    def _digest(token: str) -> str:
        return hashlib.sha256(token.encode("ascii", "strict")).hexdigest()

    def create(self, password_fingerprint: str) -> str:
        token = secrets.token_urlsafe(32)
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            if len(self._sessions) >= MAX_SESSIONS:
                oldest = min(self._sessions, key=lambda key: self._sessions[key][0])
                del self._sessions[oldest]
            self._sessions[self._digest(token)] = (
                now + SESSION_TTL_SECONDS,
                password_fingerprint,
            )
        return token

    def valid(self, token: str, password_fingerprint: str) -> bool:
        if not token or len(token) > 128:
            return False
        try:
            digest = self._digest(token)
        except (UnicodeError, ValueError):
            return False
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            record = self._sessions.get(digest)
            if record is None:
                return False
            expiry, recorded_fingerprint = record
            if expiry <= now or not hmac.compare_digest(
                recorded_fingerprint, password_fingerprint
            ):
                self._sessions.pop(digest, None)
                return False
            return True

    def delete(self, token: str) -> None:
        if not token or len(token) > 128:
            return
        try:
            digest = self._digest(token)
        except (UnicodeError, ValueError):
            return
        with self._lock:
            self._sessions.pop(digest, None)

    def _prune_locked(self, now: float) -> None:
        expired = [key for key, (expiry, _) in self._sessions.items() if expiry <= now]
        for key in expired:
            del self._sessions[key]


PASSWORD_STATE = PasswordState(PASSWORD_HASH_FILE)
SESSIONS = SessionStore()
AUTH_SLOTS = threading.BoundedSemaphore(2)


def _cookie_value(raw_cookie: str | None, name: str) -> str:
    if not raw_cookie or len(raw_cookie) > MAX_COOKIE_BYTES:
        return ""
    cookie = SimpleCookie()
    try:
        cookie.load(raw_cookie)
    except Exception:
        return ""
    morsel = cookie.get(name)
    return morsel.value if morsel else ""


def _url_origin(value: str | None) -> str:
    """Return a normalized HTTP(S) origin without retaining path data."""
    if not value or len(value) > 2048:
        return ""
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""
    default_port = 443 if parsed.scheme == "https" else 80
    port_suffix = "" if port in {None, default_port} else f":{port}"
    return f"{parsed.scheme}://{parsed.hostname.lower()}{port_suffix}"


def _is_same_origin_submission(headers: object) -> bool:
    """Accept browser form submissions while rejecting cross-site requests."""
    origin = headers.get("Origin")
    if origin:
        if origin != PUBLIC_ORIGIN:
            return False
    elif _url_origin(headers.get("Referer")) != PUBLIC_ORIGIN:
        return False

    # Some embedded browsers mark a user-initiated form navigation as `none`.
    # Exact Origin/Referer validation plus the double-submit CSRF token remains
    # authoritative; explicit cross-site Fetch Metadata is still rejected.
    fetch_site = headers.get("Sec-Fetch-Site")
    return not fetch_site or fetch_site in {"same-origin", "none"}


def _log_rejected_submission_metadata(headers: object) -> None:
    """Log only coarse request-source categories, never values or client data."""
    origin = headers.get("Origin")
    if origin == PUBLIC_ORIGIN:
        origin_state = "same"
    elif not origin:
        origin_state = "missing"
    elif origin == "null":
        origin_state = "null"
    else:
        origin_state = "other"

    referer_origin = _url_origin(headers.get("Referer"))
    if referer_origin == PUBLIC_ORIGIN:
        referer_state = "same"
    elif not referer_origin:
        referer_state = "missing"
    else:
        referer_state = "other"

    fetch_site = headers.get("Sec-Fetch-Site")
    fetch_state = (
        fetch_site
        if fetch_site in {"same-origin", "same-site", "cross-site", "none"}
        else "missing-or-other"
    )
    print(
        "submission_metadata_rejected "
        f"origin={origin_state} referer={referer_state} fetch={fetch_state}",
        file=sys.stderr,
        flush=True,
    )


class PortalHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, _format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        self._handle_get(head_only=False)

    def do_HEAD(self) -> None:
        self._handle_get(head_only=True)

    def do_POST(self) -> None:
        if self.path == "/login":
            self._handle_login()
        elif self.path == "/logout":
            self._handle_logout()
        else:
            self._plain(HTTPStatus.NOT_FOUND, b"Not found\n")

    def do_PUT(self) -> None:
        self._method_not_allowed()

    do_DELETE = do_PUT
    do_PATCH = do_PUT
    do_OPTIONS = do_PUT
    do_TRACE = do_PUT

    def _handle_get(self, head_only: bool) -> None:
        if self.path == "/healthz":
            if self.client_address[0] not in {"127.0.0.1", "::1"}:
                self._plain(HTTPStatus.NOT_FOUND, b"Not found\n", head_only)
                return
            try:
                PASSWORD_STATE.current()
            except (OSError, ValueError, UnicodeError):
                self._plain(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    b"Unavailable\n",
                    head_only,
                )
                return
            self._send(HTTPStatus.NO_CONTENT, b"", "text/plain", head_only)
            return

        if self.path == "/login.css":
            self._send(HTTPStatus.OK, LOGIN_CSS, "text/css; charset=utf-8", head_only)
            return

        if self.path not in {"/", "/login"}:
            self._plain(HTTPStatus.NOT_FOUND, b"Not found\n", head_only)
            return

        if self._valid_session_token():
            if self.path == "/login":
                self._redirect("/")
            else:
                self._render_private(head_only)
            return

        self._render_login(head_only=head_only)

    def _handle_login(self) -> None:
        if not _is_same_origin_submission(self.headers):
            _log_rejected_submission_metadata(self.headers)
            self._render_login(
                "This request could not be verified. Please try again.",
                HTTPStatus.BAD_REQUEST,
            )
            return
        if self.headers.get("Transfer-Encoding"):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/x-www-form-urlencoded":
            self._plain(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, b"Unsupported request\n")
            return
        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._plain(HTTPStatus.LENGTH_REQUIRED, b"Length required\n")
            return
        if content_length < 1 or content_length > MAX_FORM_BYTES:
            self._plain(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, b"Request too large\n")
            return

        body = self.rfile.read(content_length)
        try:
            fields = parse_qs(
                body.decode("utf-8", "strict"),
                keep_blank_values=True,
                strict_parsing=True,
                max_num_fields=4,
            )
        except (UnicodeError, ValueError):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        if set(fields) != {"password", "csrf_token"} or any(
            len(values) != 1 for values in fields.values()
        ):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return

        csrf_form = fields["csrf_token"][0]
        csrf_cookie = _cookie_value(self.headers.get("Cookie"), CSRF_COOKIE)
        if (
            not TOKEN_RE.fullmatch(csrf_form)
            or not TOKEN_RE.fullmatch(csrf_cookie)
            or not hmac.compare_digest(csrf_form, csrf_cookie)
        ):
            self._render_login(
                "This request expired. Please try again.",
                HTTPStatus.BAD_REQUEST,
            )
            return

        password = fields["password"][0]
        password_bytes = password.encode("utf-8", "strict")
        # bcrypt considers at most 72 bytes. Reject longer input instead of
        # silently accepting a different password with the same 72-byte prefix.
        if not password_bytes or len(password_bytes) > 72 or b"\x00" in password_bytes:
            self._render_login(
                "The password is incorrect. Please try again.",
                HTTPStatus.UNAUTHORIZED,
            )
            return

        try:
            bcrypt_hash, fingerprint = PASSWORD_STATE.current()
        except (OSError, ValueError, UnicodeError):
            self._render_login(
                "The login service is temporarily unavailable. Please try again later.",
                HTTPStatus.SERVICE_UNAVAILABLE,
            )
            return

        verified = False
        if AUTH_SLOTS.acquire(timeout=3):
            try:
                candidate = crypt.crypt(password, bcrypt_hash)
                verified = bool(candidate) and hmac.compare_digest(candidate, bcrypt_hash)
            except (OSError, ValueError):
                verified = False
            finally:
                AUTH_SLOTS.release()

        if not verified:
            self._render_login(
                "The password is incorrect. Please try again.",
                HTTPStatus.UNAUTHORIZED,
            )
            return

        token = SESSIONS.create(fingerprint)
        self.send_response_only(HTTPStatus.SEE_OTHER)
        self.send_header("Location", "/")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Xi-Intranet-Portal", "password-form")
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_TTL_SECONDS}; "
            "Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header(
            "Set-Cookie",
            f"{CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _handle_logout(self) -> None:
        if not _is_same_origin_submission(self.headers):
            _log_rejected_submission_metadata(self.headers)
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        if self.headers.get("Transfer-Encoding"):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/x-www-form-urlencoded":
            self._plain(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, b"Unsupported request\n")
            return
        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._plain(HTTPStatus.LENGTH_REQUIRED, b"Length required\n")
            return
        if content_length < 1 or content_length > MAX_FORM_BYTES:
            self._plain(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, b"Request too large\n")
            return
        try:
            fields = parse_qs(
                self.rfile.read(content_length).decode("utf-8", "strict"),
                keep_blank_values=True,
                strict_parsing=True,
                max_num_fields=2,
            )
        except (UnicodeError, ValueError):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        if set(fields) != {"csrf_token"} or len(fields["csrf_token"]) != 1:
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return
        csrf_form = fields["csrf_token"][0]
        csrf_cookie = _cookie_value(self.headers.get("Cookie"), CSRF_COOKIE)
        if (
            not TOKEN_RE.fullmatch(csrf_form)
            or not TOKEN_RE.fullmatch(csrf_cookie)
            or not hmac.compare_digest(csrf_form, csrf_cookie)
        ):
            self._plain(HTTPStatus.BAD_REQUEST, b"Bad request\n")
            return

        token = _cookie_value(self.headers.get("Cookie"), SESSION_COOKIE)
        SESSIONS.delete(token)
        self.send_response_only(HTTPStatus.SEE_OTHER)
        self.send_header("Location", "/login")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Xi-Intranet-Portal", "password-form")
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header(
            "Set-Cookie",
            f"{CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
        )
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _valid_session_token(self) -> str:
        token = _cookie_value(self.headers.get("Cookie"), SESSION_COOKIE)
        if not token:
            return ""
        try:
            _, fingerprint = PASSWORD_STATE.current()
        except (OSError, ValueError, UnicodeError):
            return ""
        return token if SESSIONS.valid(token, fingerprint) else ""

    def _render_private(self, head_only: bool = False) -> None:
        csrf_token = self._csrf_token()
        body = _private_html(csrf_token)
        self.send_response_only(HTTPStatus.OK)
        self._common_headers("text/html; charset=utf-8", len(body))
        self.send_header(
            "Set-Cookie",
            f"{CSRF_COOKIE}={csrf_token}; Path=/; Max-Age={CSRF_TTL_SECONDS}; "
            "Secure; HttpOnly; SameSite=Strict",
        )
        self.end_headers()
        if not head_only:
            self.wfile.write(body)
        self.close_connection = True

    def _render_login(
        self,
        error: str | None = None,
        status: HTTPStatus = HTTPStatus.OK,
        head_only: bool = False,
    ) -> None:
        csrf_token = self._csrf_token()
        body = _login_html(csrf_token, error)
        self.send_response_only(status)
        self._common_headers("text/html; charset=utf-8", len(body))
        self.send_header(
            "Set-Cookie",
            f"{CSRF_COOKIE}={csrf_token}; Path=/; Max-Age={CSRF_TTL_SECONDS}; "
            "Secure; HttpOnly; SameSite=Strict",
        )
        self.end_headers()
        if not head_only:
            self.wfile.write(body)
        self.close_connection = True

    def _csrf_token(self) -> str:
        current = _cookie_value(self.headers.get("Cookie"), CSRF_COOKIE)
        return current if TOKEN_RE.fullmatch(current) else secrets.token_urlsafe(32)

    def _send(
        self,
        status: HTTPStatus,
        body: bytes,
        content_type: str,
        head_only: bool = False,
    ) -> None:
        self.send_response_only(status)
        self._common_headers(content_type, len(body))
        self.end_headers()
        if not head_only and body:
            self.wfile.write(body)
        self.close_connection = True

    def _plain(
        self,
        status: HTTPStatus,
        body: bytes,
        head_only: bool = False,
    ) -> None:
        self._send(status, body, "text/plain; charset=utf-8", head_only)

    def _redirect(self, location: str) -> None:
        self.send_response_only(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Xi-Intranet-Portal", "password-form")
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _method_not_allowed(self) -> None:
        self.send_response_only(HTTPStatus.METHOD_NOT_ALLOWED)
        self.send_header("Allow", "GET, HEAD, POST")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _common_headers(self, content_type: str, content_length: int) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Xi-Intranet-Portal", "password-form")
        self.send_header("Connection", "close")


class BoundedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 16

    def __init__(self, server_address: tuple[str, int], handler: type[PortalHandler]):
        self._request_slots = threading.BoundedSemaphore(MAX_CONCURRENT_REQUESTS)
        super().__init__(server_address, handler)

    def process_request(self, request: object, client_address: object) -> None:
        self._request_slots.acquire()
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request: object, client_address: object) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


def main() -> None:
    PASSWORD_STATE.current()
    server = BoundedHTTPServer((LISTEN_HOST, LISTEN_PORT), PortalHandler)
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
