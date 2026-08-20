# Xi Li intranet

The private portal is served from `https://intranet.ximarketing.ai/`. Visitors
see a password-only form; no username field is shown. The page behind the form
is intentionally empty except for a Log out control until private content is
added.

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

Both paths validate containers and the public proxy before completion. The
migration keeps its root-only legacy rollback bundle until Xi confirms that
the preserved password works with the new form; remove that dated bundle only
after acceptance. An unverified automatic rollback also retains its bundle.
