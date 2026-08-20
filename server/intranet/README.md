# Xi Li intranet

The private portal is served from `https://intranet.ximarketing.ai/`. Visitors
see a password-only form; no username field is shown. The page behind the form
keeps the public website navigation and provides a data-driven Games directory.
The first entry opens Negotiation Games at the protected same-origin path
`/games/negotiation/`. Add future game cards to the `GAMES` tuple in
`portal.py`; do not hand-code additional cards.

The portal header mirrors the public site's Palatino typography, spacing,
language selector, and light/dark theme control. English, Simplified Chinese,
and Traditional Chinese are translated in place by the same-origin static
`/intranet.js` served from `portal.py`; no third-party scripts or fonts are
loaded. The session cookie remains `HttpOnly`, so client-side presentation code
cannot read it. The public site's Intranet link carries the selected `?lang=`
value across the subdomain boundary because browser storage is origin-scoped.

The public Caddy instance terminates HTTPS and connects only to a rate-limited
nginx gateway on `ximarketing_intranet_edge`. The gateway connects to the
Python password portal on the separate `ximarketing_intranet_app` network.
Neither private service publishes a host port, and unrelated website
containers cannot reach the password portal.

The public Caddy service receives its edge-network attachment from
`/opt/ximarketing-games/negotiation-game/compose.override.yaml`. Every future
Compose operation for that public stack must therefore include both files:

```sh
sudo docker compose \
  -f /opt/ximarketing-games/negotiation-game/compose.yaml \
  -f /opt/ximarketing-games/negotiation-game/compose.override.yaml up -d
```

Running the base Compose file alone can recreate Caddy without the private
edge-network attachment and make the intranet unavailable.
Server-side scripts that modify the shared public Caddyfile or Compose override
must hold an exclusive lock on `/run/lock/ximarketing-public-stack.lock`
through validation, reload, and any rollback.

The portal verifies the bcrypt hash stored in the root-managed
`/opt/ximarketing-intranet/secrets` directory. It creates opaque, server-side
sessions and sends a `Secure`, `HttpOnly`, `SameSite=Strict` cookie that expires
after 12 hours. Session tokens are stored only as SHA-256 digests in memory.
Changing the password changes its fingerprint, which immediately invalidates
every existing session. Passwords, cookies, form bodies, and client IP
addresses are not written to application logs.

Private content, password hashes, session data, and credentials must never be
committed to this public repository, included in the GitHub Pages build, or
added to the public chatbot context.

## Protected games

The public Caddy instance authenticates every request under
`/games/negotiation/` through the intranet gateway before proxying it directly
to the game container. The browser's host-only `__Host-intranet_session`
cookie is reused for this check, but Caddy removes that cookie before the game
upstream receives the request. The game container has no published host port.
State-changing game API requests must also carry the exact same-origin
`Origin: https://intranet.ximarketing.ai` header. The gateway rate-limits
session checks independently from password attempts.

The Negotiation Games production bundle must be built with
`VITE_API_BASE=/games/negotiation` so that its API and event-stream requests
stay inside the protected prefix. Caddy strips that prefix only after the
session check. Keep streaming proxy buffering disabled (`flush_interval -1`).

`Caddyfile.negotiation-redirect.example` replaces the former public game
proxy. Browser visits to `https://negotiation.ximarketing.ai/` are redirected
to the protected intranet route, while legacy `/api/*` and `/health` requests
return 404. This redirect block is part of the security boundary: restoring
the old public reverse proxy would bypass the intranet login.

Each future game needs both a `GAMES` entry and its own protected Caddy route.
Never link a private card to an absolute public game URL, broaden the session
cookie to `.ximarketing.ai`, or expose a game container port on the host.

Authentication is checked when an event stream is opened. Existing streams
cannot be re-checked mid-connection, so Caddy caps them at one hour; the client
then reconnects and is authenticated again. Logging out or changing the
password invalidates ordinary requests immediately and blocks the next stream
reconnection.

Keep the `intranet` DNS record in **DNS-only** mode. If it is later changed to
Cloudflare proxying, configure trusted Cloudflare proxy ranges before relying
on the per-client request limiter; otherwise unrelated visitors may share one
Cloudflare edge address and the real per-client limit will not work.

## Reset a forgotten password

Open an interactive Tencent Cloud terminal and run:

```sh
sudo reset-intranet-password
```

The old password is not required. Input is hidden, and the tool asks for the
new password twice. It currently requires exactly 8 characters at the site
owner's request. Use a randomly generated combination of upper- and lowercase
letters, numbers, and symbols; do not use names, dates, or common words. The
gateway's per-IP and global limits reduce online guessing but do not make a
weak password safe.

If SSH access is lost as well, recover access through Tencent Cloud's official
account and instance console. Never send the Tencent Cloud account password,
SMS codes, SSH private keys, or the intranet password through chat.

## Deployment

For a fresh server, stage this directory and run:

```sh
sudo ./install-intranet
```

To replace the legacy browser username/password prompt while preserving its
existing password hash, run:

```sh
sudo ./migrate-password-form
```

To deploy the protected Negotiation Games route after staging the portal,
tests, nginx/Caddy examples, and rebuilt `game-dist` in one directory, run:

```sh
sudo ./deploy-private-negotiation-game --force /path/to/staged-bundle
```

This updater takes both shared locks, validates the candidates, replaces the
old public game host and the protected intranet route in one transaction, and
keeps a root-only rollback bundle until the authenticated game is accepted.
The game currently stores rooms in memory, so this command intentionally
requires `--force`: run it only in a maintenance window when no class or game
session is active. Rebuilding the game clears every active room.

For a portal-only visual, copy, or language update, stage `portal.py`,
`test_portal.py`, `Caddyfile.proxy.example`, `README.md`, `compose.yaml`,
`nginx.conf`, and `compose.proxy.override.yaml`, then run:

```sh
sudo ./deploy-intranet-ui /path/to/staged-intranet-files
```

This smaller updater does not rebuild or restart a game. It validates the
authentication tests and Caddy policy, backs up the previous portal, replaces
only the managed intranet block, and rolls back on a failed public smoke test.
Restarting the portal clears its in-memory login sessions, so visitors need to
enter the password again after an update.

Both paths validate containers and the public proxy before completion. The
migration keeps its root-only legacy rollback bundle until Xi confirms that
the preserved password works with the new form; remove that dated bundle only
after acceptance. An unverified automatic rollback also retains its bundle.
