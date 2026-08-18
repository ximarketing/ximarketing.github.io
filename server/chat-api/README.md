# Xi Marketing website assistant and contact API

This small Python service is designed to run behind Caddy at
`https://chat.ximarketing.ai/api/chat` and
`https://chat.ximarketing.ai/api/contact`. It keeps the OpenRouter and Resend
keys on the server, accepts requests only from the website, limits request size
and rate, and resolves model-provided source IDs against the site's published
knowledge file. Contact messages are sent as plain text to a fixed recipient;
the visitor's address is used only as Reply-To. One optional attachment of up
to 2 MB is accepted in PDF, JPG, JPEG, or PNG format. The service strictly
decodes the Base64 payload, validates both the extension and file signature,
and forwards it to the email provider under a server-generated safe filename.
Attachments are validated in memory and are not written to disk or retained.

The production secret belongs in `/etc/ximarketing-chat.env` with mode `600`.
Do not place it in this repository, frontend JavaScript, shell history, or chat.
After deployment, run `sudo /opt/ximarketing-chat/set-openrouter-key.sh`
from an interactive server terminal; it accepts the key with terminal echo
disabled and restarts the service.

For the contact form, create a sending-only Resend key and run
`sudo /opt/ximarketing-chat/set-resend-key.sh` from an interactive server
terminal. The default Resend testing sender can deliver only to the email
address associated with the Resend account. For regular delivery, verify a
sending subdomain and update `CONTACT_FROM_EMAIL` in the server environment.

Deployment outline:

1. Copy `app.py` and `compose.yaml` to `/opt/ximarketing-chat/`.
2. Copy and fill `ximarketing-chat.env.example` at `/etc/ximarketing-chat.env`.
3. Start `chat-api` with Docker Compose on the existing proxy network. The
   included systemd unit remains an alternative for servers without Docker.
4. Add `Caddyfile.chat.example` to the server's existing Caddy configuration;
   validate the full configuration before reloading Caddy.
5. Point `chat.ximarketing.ai` to the server, then obtain a TLS certificate.
6. Verify `/health`, CORS preflight, rate limiting, a grounded answer, and one
   real contact-form delivery before deploying the frontend.

Run local unit tests with:

```sh
cd server/chat-api
python3 -m unittest -v
```
