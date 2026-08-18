#!/usr/bin/env bash
set -eu

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Run this command with sudo.' >&2
  exit 1
fi

TASK_MODEL="${1:-z-ai/glm-5.2}"
case "$TASK_MODEL" in
  ''|*[!A-Za-z0-9._:/~-]*)
    printf '%s\n' 'The model slug contains unsupported characters.' >&2
    exit 1
    ;;
esac

printf '%s' 'Paste the dedicated OpenRouter API key (input is hidden): '
IFS= read -r -s TASK_OPENROUTER_KEY
printf '\n'

case "$TASK_OPENROUTER_KEY" in
  sk-or-v1-*) ;;
  *)
    unset TASK_OPENROUTER_KEY
    printf '%s\n' 'That does not look like an OpenRouter API key.' >&2
    exit 1
    ;;
esac

case "$TASK_OPENROUTER_KEY" in
  *[!A-Za-z0-9_-]*)
    unset TASK_OPENROUTER_KEY
    printf '%s\n' 'The OpenRouter API key contains unsupported characters.' >&2
    exit 1
    ;;
esac

umask 077
TASK_ENV_FILE=$(mktemp /etc/ximarketing-chat.env.XXXXXX)
trap 'rm -f "$TASK_ENV_FILE"' EXIT HUP INT TERM
if [ -f /etc/ximarketing-chat.env ]; then
  grep -Ev '^(OPENROUTER_API_KEY|OPENROUTER_MODEL)=' /etc/ximarketing-chat.env > "$TASK_ENV_FILE" || true
fi
printf 'OPENROUTER_API_KEY=%s\n' "$TASK_OPENROUTER_KEY" >> "$TASK_ENV_FILE"
printf 'OPENROUTER_MODEL=%s\n' "$TASK_MODEL" >> "$TASK_ENV_FILE"
unset TASK_OPENROUTER_KEY

append_default() {
  TASK_ENV_NAME=$1
  TASK_ENV_VALUE=$2
  if ! grep -q "^${TASK_ENV_NAME}=" "$TASK_ENV_FILE"; then
    printf '%s=%s\n' "$TASK_ENV_NAME" "$TASK_ENV_VALUE" >> "$TASK_ENV_FILE"
  fi
}

append_default SITE_CONTEXT_URL 'https://ximarketing.ai/chatbot-context.json'
append_default ALLOWED_ORIGINS 'https://ximarketing.ai,https://www.ximarketing.ai'
append_default HOST '0.0.0.0'
append_default PORT '8787'
append_default CONTEXT_CACHE_SECONDS '600'
append_default RATE_LIMIT_REQUESTS '20'
append_default RATE_LIMIT_WINDOW_SECONDS '600'
append_default DAILY_REQUEST_LIMIT '500'
append_default MAX_CONCURRENT_CHATS '4'
append_default MAX_CONNECTION_THREADS '16'

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
printf '\n%s\n' 'OpenRouter key stored and assistant service restarted.'
