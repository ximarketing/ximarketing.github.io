# Xi Li intranet

The private portal is served from `https://intranet.ximarketing.ai/`. The
public Caddy instance forwards only this hostname to a portless, rate-limited
gateway and a separate authentication container. All three services share a
dedicated internal Docker network; unrelated website containers cannot observe
the Basic Authentication credentials. The page is deliberately blank until
private content is added.

The portal uses Caddy HTTP Basic Authentication with the fixed username
`member`. Only a bcrypt password hash is persisted in the root-managed
`/opt/ximarketing-intranet` directory on the server. It is never stored in the
public Caddyfile. Private content and password hashes must never be committed to
this public repository, included in the GitHub Pages build, or added to the
public chatbot context.

Caddy may retain a transient in-memory comparison cache while the isolated
authentication container is running; restarting that container clears it. The
containers have no published ports and strict CPU, memory, and process limits.
The gateway also limits repeated requests per source address before password
verification, so authentication load cannot exhaust the public Caddy service.

Keep the `intranet` DNS record in **DNS-only** mode. If it is later changed to
Cloudflare proxying, configure trusted Cloudflare proxy ranges before relying
on the per-client request limiter; otherwise multiple visitors may appear to
share one Cloudflare edge address.

The one-time installer starts with a discarded random password. The portal
therefore cannot be opened until Xi sets the first usable password with the
reset command below.

## Reset a forgotten password

Open an interactive Tencent Cloud terminal and run:

```sh
sudo reset-intranet-password
```

The old password is not required. The command asks for the new password twice
with hidden input, validates the resulting Caddy configuration, and restores the
previous configuration automatically if validation or reload fails.

The reset tool currently requires exactly 8 characters at the site owner's
request. Use a randomly generated combination of upper- and lowercase letters,
numbers, and symbols; do not use names, dates, or common words. The gateway's
rate limit reduces online guessing but does not make a weak password safe. If
the isolated authentication container is stopped, the reset command starts it
before updating the password.

If SSH access is lost as well, recover access through Tencent Cloud's official
account and instance console. Never send the Tencent Cloud account password,
SMS codes, SSH private keys, or the intranet password through chat.
