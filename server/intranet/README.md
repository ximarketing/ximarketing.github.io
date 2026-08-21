# Xi Li intranet

The private portal is served from `https://intranet.ximarketing.ai/`. Visitors
see a password-only form; no username field is shown. The page behind the form
keeps the public website navigation and provides separate data-driven Games and
Tools directories.
The directory currently opens Negotiation Games at `/games/negotiation/`,
A/B Test Showdown at `/games/ab-test/`, and Haggle Arena at
`/games/haggle/`. The Tools directory opens Classroom Random Picker at
`/tools/classroom-picker/`. Add future resources to the `GAMES` or `TOOLS`
tuple in `portal.py`; do not hand-code additional cards.

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

## Games and public participant entry

Participants do not need the Intranet password. Caddy exposes only the
participant pages, their required static assets, and an explicit allowlist of
participant APIs. Host-only pages and control endpoints still pass through the
Intranet gateway. The browser's host-only `__Host-intranet_session` cookie is
used for that check, but Caddy removes it before any game upstream receives the
request. All game containers have no published host port. Every state-changing
game API request, public or protected, must carry the exact same-origin
`Origin: https://intranet.ximarketing.ai` header. Unlisted paths under each game
prefix return 404 instead of inheriting public access.

Negotiation Games serves its SPA and assets publicly. Participant room reads,
joins, configuration submissions, and event streams are public only on their
exact API routes. Creating a room, starting a room, and using the single-player
`/api/negotiate` endpoint remain password-protected; the application also
requires the appropriate unpredictable host or participant token. Caddy
overwrites `X-Xi-Client-IP` with its own `{remote_host}` value on every
Negotiation Games upstream request; the application trusts that value only
because the container is reachable exclusively through Caddy.

The Negotiation Games production bundle must be built with
`VITE_API_BASE=/games/negotiation` so that its API and event-stream requests
stay inside the routed prefix. Caddy strips that prefix only after applying the
public-participant or protected-host policy. After a host signs in to the
intranet, the game does not ask for a second start PIN. Keep streaming proxy
buffering disabled (`flush_interval -1`).

`Caddyfile.negotiation-redirect.example` replaces the former public game
proxy. Browser visits to `https://negotiation.ximarketing.ai/` are redirected
to the public intranet game page, while legacy `/api/*` and `/health` requests
return 404. This redirect block is part of the security boundary: restoring
the old public reverse proxy would bypass the participant/host route policy.

Each future game needs both a `GAMES` entry and its own method-and-path Caddy
allowlist. Never make an entire game prefix public, broaden the session cookie
to `.ximarketing.ai`, or expose a game container port on the host.

Haggle Arena is served under `/games/haggle/` from an isolated container on
the dedicated `ximarketing_haggle_private` bridge. This bridge has only Caddy
and Haggle as members and publishes no host ports, but deliberately permits
outbound HTTPS so the server can reach OpenRouter. The public player
page, its local assets, player event polling, and the five exact player write
endpoints require no Intranet password. The host page at
`/games/haggle/host.html` and every `/api/host/*` endpoint remain behind the
Intranet session. Caddy injects `X-Haggle-Host-Authenticated: 1` only after
that check and clears the header on every public route; the application then
issues a separate high-entropy in-memory host capability. Players enter through
the current host QR invitation and receive their own player token. Neither
capability is stored in logs or exposed in the ordinary page URL.

Haggle player messages can trigger paid OpenRouter requests. The application
therefore rate-limits joins, polling, and message actions, allows only one AI
request at a time per player, caps total concurrent AI work, and requires the
current high-entropy invitation. Deployment must provide the key through the
root-only `/opt/ximarketing-games/haggle-game/.env`; it must never be copied
into the staged source, Docker image, portal, Caddyfile, or a command line.
Caddy overwrites `X-Xi-Client-IP` on every Haggle upstream request, and the
application accepts that header only because its container is reachable solely
through Caddy.

A/B Test Showdown is served under `/games/ab-test/` from an isolated container
on the dedicated internal `ximarketing_ab_test_private` network. Its landing
page, player page, shared styles/translations/images, and participant Socket.IO
transport at `/games/ab-test/socket.io` are public. The host page remains
protected at `/games/ab-test/host.html`; its separately protected
`/games/ab-test/host-socket.io` transport receives
`X-AB-Host-Authenticated: 1`. The public transport always has that header
cleared. Socket.IO and QR-code assets are bundled locally rather than loaded
from a CDN. Players join through the current host QR invitation; the bare
landing page does not fabricate an invitation or expose a broken join link.
The game has no separate password. Each new session preserves the
factual winner for every experiment while randomly swapping its visible A/B
position, with exactly six A and six B answers in the twelve-round deck.

The A/B card and proxy route are one optional feature profile, delimited by the
`XIMARKETING AB TEST FEATURE` markers in `portal.py` and
`Caddyfile.proxy.example`. Classroom Picker and Haggle Arena have their own
independent `XIMARKETING CLASSROOM PICKER FEATURE` and
`XIMARKETING HAGGLE FEATURE` marker pairs. Keep exactly one complete pair for
each optional feature in each source file. `intranet-feature-profile.sh` is the
sole renderer for the eight supported combinations: `base`, `ab`, `picker`,
`full`, `haggle`, `ab-haggle`, `picker-haggle`, and `full-haggle`. The
historical `full` name continues to mean A/B Test plus Classroom Picker;
`full-haggle` enables all three optional resources. Installers and updaters
must not duplicate or hand-edit feature state.

Every protected host request still performs a server-side session check. The
gateway auth-check capacity and portal queue remain separate from the public
participant traffic. Cold password logins behind one shared campus IP remain
limited to five attempts per IP per minute; students no longer need to sign in.

Host QR codes link directly to public participant pages. The portal accepts
only the A/B host page, Classroom Picker host page, and Haggle host page as
same-origin login return destinations; public participant paths are
deliberately excluded from that allowlist.

The protected A/B host Socket.IO transport is authenticated when each
connection is opened. Existing connections cannot be re-checked
mid-connection, so Caddy caps them at one hour; the host client then reconnects
and is authenticated again. Logging out or changing the password invalidates
ordinary protected requests immediately and blocks the next protected host
reconnection. Public participant streams and sockets remain bound to their
application-issued room or player tokens instead of the Intranet session.

## Tools and public participant entry

Classroom Random Picker is served under `/tools/classroom-picker/` from an
isolated container on the dedicated internal
`ximarketing_classroom_picker_private` network. It has no published host port,
and Caddy exposes only the participant root/index/assets, `GET /api/state`, and
`POST /api/submit`. The host page and every `/api/host/*` endpoint still require
the Intranet session before the protected prefix is stripped. Other paths under
the tool prefix return 404. State-changing requests require the exact
same-origin `Origin: https://intranet.ximarketing.ai` header.

The tool does not ask for a second password. When the host page is opened, the
server issues an invisible, high-entropy, in-memory host capability and stores
only its SHA-256 digest. The raw capability stays in that browser tab's
`sessionStorage`; a second host cannot take over while the five-minute host
lease remains active. Closing the host page releases the lease; the same tab
can recover its session after a reload, while a genuinely new host starts with
a blank roster. Because the outer Intranet uses one shared password and has no
individual accounts, the server cannot identify the lecturer—the lecturer
should open the host page before sharing its locally generated QR code.

Each active host session also generates a separate 256-bit participant
invitation embedded only in the QR link fragment. Participants type no
password, but `/api/submit` accepts names only when the current invitation is
present. The invitation is absent from public state and HTTP logs and rotates
when the host resets or a genuinely new host takes over.

Participants enter only a first name or nickname. Participant polling never
receives the roster or selected names; those are returned only to the active
host. Names, host state, and selection state live only in memory, are not
written to application logs, and disappear whenever the container is
restarted. QR codes and fonts are bundled locally; the public join URL is not
sent to an external service.

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

Fresh installation intentionally renders the base profile: it installs the
login portal and Negotiation Games route, creates all three optional-feature
networks with Caddy as their only member, and advertises neither A/B Test
Showdown, Classroom Picker, nor Haggle Arena before its backend exists. The
legacy migration uses the same base profile.

To replace the legacy browser username/password prompt while preserving its
existing password hash, run:

```sh
sudo ./migrate-password-form
```

To deploy the public-participant/protected-host Negotiation Games route after staging the portal,
tests, nginx/Caddy examples, `compose.proxy.override.yaml`,
`intranet-feature-profile.sh`, and rebuilt `game-dist` in one directory, run:

```sh
sudo ./deploy-private-negotiation-game --force /path/to/staged-bundle
```

This updater takes both shared locks, validates the candidates, replaces the
old public game host and the protected intranet route in one transaction, and
keeps a root-only rollback bundle until the authenticated game is accepted.
It detects whether A/B Test Showdown is active and preserves that card, route,
container, and dedicated-network membership unchanged. It independently
preserves Classroom Picker and Haggle Arena in the same way.
The game currently stores rooms in memory, so this command intentionally
requires `--force`: run it only in a maintenance window when no class or game
session is active. Rebuilding the game clears every active room.

To deploy A/B Test Showdown, stage the modified game source together with the
current intranet files and run:

```sh
sudo ./deploy-private-ab-test-game --force /path/to/staged-bundle
```

The updater
creates the separate internal game network, builds the Node container without
publishing a host port, updates the portal and managed Caddy block
transactionally, and does not restart Negotiation Games. A/B Test Showdown
keeps its classroom state only in memory, so updating its container clears an
active A/B session. It detects and preserves Classroom Picker and Haggle Arena
independently.

To deploy Classroom Random Picker, stage its current source as `tool/` together
with the current intranet files and run:

```sh
sudo ./deploy-private-classroom-picker-tool --force /path/to/staged-bundle
```

The updater builds the tool in a pinned Node image, creates its dedicated
internal network, installs the Tools card and split participant/host Caddy route, and leaves
Negotiation Games and A/B Test Showdown untouched. It also verifies that the
password hash is byte-for-byte unchanged. The tool's roster and host lease are
memory-only, so the command requires `--force` and must run outside an active
class. Haggle Arena is detected and preserved independently.

To deploy Haggle Arena, stage its current source as `game/` together with the
current intranet files and run:

```sh
sudo ./deploy-private-haggle-game --force /path/to/staged-bundle
```

The updater builds and audits the Node application before the transaction,
creates the dedicated egress-capable Haggle bridge, and activates the
public-player/protected-host route without restarting Negotiation Games, A/B
Test Showdown, or Classroom Picker. On first installation it copies only the
already configured `OPENROUTER_API_KEY` assignment from the root-only
Negotiation Games environment into the new root-only Haggle environment; it
never prints the value. If no configured key is available, preflight stops
before any running service or file is changed. Later updates preserve the
existing Haggle environment byte-for-byte. Haggle sessions and leaderboards
are memory-only, so `--force` is required and the command must run outside an
active class.

For a portal-only visual, copy, or language update, stage `portal.py`,
`test_portal.py`, `Caddyfile.proxy.example`, `README.md`, `compose.yaml`,
`nginx.conf`, `compose.proxy.override.yaml`, and
`intranet-feature-profile.sh`, then run:

```sh
sudo ./deploy-intranet-ui /path/to/staged-intranet-files
```

This smaller updater does not rebuild or restart a game. It validates the
authentication tests and Caddy policy, backs up the previous portal, replaces
only the managed intranet block, and rolls back on a failed public smoke test.
It renders the incoming canonical source to the currently active one of eight
feature profiles, so an ordinary UI deployment cannot add a dead resource
route or remove a working one.
Restarting the portal clears its in-memory login sessions, so visitors need to
enter the password again after an update.

For a gateway-only nginx policy update, use the focused updater. It validates
the candidate, creates a root-only backup, recreates only the gateway, checks a
burst of CSS and JavaScript requests, and leaves the password, portal session,
and game container unchanged:

```sh
sudo ./deploy-intranet-gateway /path/to/nginx.conf
```

Both paths validate containers and the public proxy before completion. The
migration keeps its root-only legacy rollback bundle until Xi confirms that
the preserved password works with the new form; remove that dated bundle only
after acceptance. An unverified automatic rollback also retains its bundle.
