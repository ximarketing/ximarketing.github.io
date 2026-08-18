#!/usr/bin/env bash
set -eu

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Run this command with sudo.' >&2
  exit 1
fi

printf '%s' 'Paste the dedicated Resend API key (input is hidden): '
IFS= read -r -s TASK_RESEND_KEY
printf '\n'

case "$TASK_RESEND_KEY" in
  re_*) ;;
  *)
    unset TASK_RESEND_KEY
    printf '%s\n' 'That does not look like a Resend API key.' >&2
    exit 1
    ;;
esac

case "$TASK_RESEND_KEY" in
  *[!A-Za-z0-9_-]*)
    unset TASK_RESEND_KEY
    printf '%s\n' 'The Resend API key contains unsupported characters.' >&2
    exit 1
    ;;
esac

umask 077
TASK_ENV_FILE=$(mktemp /etc/ximarketing-chat.env.XXXXXX)
trap 'rm -f "$TASK_ENV_FILE"' EXIT HUP INT TERM
if [ -f /etc/ximarketing-chat.env ]; then
  grep -Ev '^RESEND_API_KEY=' /etc/ximarketing-chat.env > "$TASK_ENV_FILE" || true
fi
printf 'RESEND_API_KEY=%s\n' "$TASK_RESEND_KEY" >> "$TASK_ENV_FILE"
unset TASK_RESEND_KEY

append_default() {
  TASK_ENV_NAME=$1
  TASK_ENV_VALUE=$2
  if ! grep -q "^${TASK_ENV_NAME}=" "$TASK_ENV_FILE"; then
    printf '%s=%s\n' "$TASK_ENV_NAME" "$TASK_ENV_VALUE" >> "$TASK_ENV_FILE"
  fi
}

append_default CONTACT_FROM_EMAIL 'Xi Li Website <onboarding@resend.dev>'
append_default CONTACT_TO_EMAIL 'xili@hku.hk'
append_default CONTACT_RATE_LIMIT_REQUESTS '5'
append_default CONTACT_RATE_LIMIT_WINDOW_SECONDS '3600'
append_default CONTACT_DAILY_LIMIT '50'
append_default TRUSTED_PROXY_CIDRS '127.0.0.0/8,::1/128,172.18.0.0/16'

chown root:root "$TASK_ENV_FILE"
chmod 600 "$TASK_ENV_FILE"
mv "$TASK_ENV_FILE" /etc/ximarketing-chat.env
trap - EXIT HUP INT TERM

if [ -f /opt/ximarketing-chat/compose.yaml ]; then
  cd /opt/ximarketing-chat
  docker compose up -d --force-recreate chat-api
  sleep 2
  docker compose exec -T chat-api python3 -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8787/health', timeout=3).read().decode())"
else
  systemctl restart ximarketing-chat.service
  sleep 1
  curl --fail --silent http://127.0.0.1:8787/health
fi
printf '\n%s\n' 'Resend key stored and contact service restarted.'
