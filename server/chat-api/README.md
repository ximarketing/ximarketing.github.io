# Xi Marketing website assistant API

This small Python service is designed to run behind Caddy at
`https://chat.ximarketing.ai/api/chat`. It keeps the OpenRouter key on the
server, accepts requests only from the website, limits request size and rate,
and resolves model-provided source IDs against the site's published knowledge
file.

The production secret belongs in `/etc/ximarketing-chat.env` with mode `600`.
Do not place it in this repository, frontend JavaScript, shell history, or chat.
After deployment, run `sudo /opt/ximarketing-chat/set-openrouter-key.sh`
from an interactive server terminal; it accepts the key with terminal echo
disabled and restarts the service.

Deployment outline:

1. Copy `app.py` and `compose.yaml` to `/opt/ximarketing-chat/`.
2. Copy and fill `ximarketing-chat.env.example` at `/etc/ximarketing-chat.env`.
3. Start `chat-api` with Docker Compose on the existing proxy network. The
   included systemd unit remains an alternative for servers without Docker.
4. Add `Caddyfile.chat.example` to the server's existing Caddy configuration;
   validate the full configuration before reloading Caddy.
5. Point `chat.ximarketing.ai` to the server, then obtain a TLS certificate.
6. Verify `/health`, CORS preflight, rate limiting, and a grounded answer before
   deploying the frontend.

Run local unit tests with:

```sh
cd server/chat-api
python3 -m unittest -v
```
