# Self-Hosting OpenViktor

## Quick Start

### Prerequisites

- Docker and Docker Compose
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- At least one LLM provider key

### 1. Create a Telegram Bot

1. Open [@BotFather](https://t.me/BotFather)
2. Run `/newbot`
3. Choose a display name and username
4. Copy the bot token

### 2. Run the Setup Wizard

```bash
git clone https://github.com/zggf-zggf/openviktor.git
cd openviktor
bun install
bun run --filter @openviktor/bot setup
```

The wizard writes `.env` with:

- `TELEGRAM_BOT_TOKEN`
- your LLM keys
- database credentials
- dashboard basic-auth credentials

If you want to use Ollama, leave the cloud API keys empty and provide an Ollama model like `llama3.2`. The wizard will write:

```env
DEFAULT_MODEL=ollama/llama3.2
OLLAMA_BASE_URL=http://localhost:11434
```

### 3. Start the Stack

```bash
docker compose -f docker/docker-compose.selfhosted.yml up -d
```

### 4. Verify

1. Open Telegram
2. Send a message to your bot
3. Open the dashboard at `http://localhost:3001`

You can also use Telegram slash commands. `/start`, `/help`, `/tools`, `/status`, `/new`, and other `/<command>` inputs are routed into the same main agent flow.

## Manual Environment Setup

Required variables:

```env
DEPLOYMENT_MODE=selfhosted
TELEGRAM_BOT_TOKEN=123456:telegram-secret
DATABASE_URL=postgresql://openviktor:openviktor@postgres:5432/openviktor
POSTGRES_PASSWORD=openviktor
DASHBOARD_PASSWORD=change-me
ENCRYPTION_KEY=64_hex_chars
```

At least one LLM provider must be configured:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
```

Optional:

```env
TELEGRAM_BOT_USERNAME=my_openviktor_bot
REDIS_URL=redis://redis:6379
ENABLE_DASHBOARD=true
LOG_LEVEL=info
GITHUB_TOKEN=ghp_...
```

## Supported Tools

OpenViktor ships with built-in support for:

- Telegram messaging
- File read/write/edit and markdown conversion
- Glob and grep
- Sandboxed shell commands
- Git and GitHub CLI
- Docs lookup and AI-assisted search
- Browser automation
- Memory and skills
- Pipedream app integrations
- Spaces tooling
- Image generation and image viewing

## Troubleshooting

### Bot not responding

1. Check logs: `docker compose -f docker/docker-compose.selfhosted.yml logs -f bot`
2. Verify `TELEGRAM_BOT_TOKEN` in `.env`
3. Send a direct message to the bot first

### Dashboard login issues

1. Verify `DASHBOARD_PASSWORD` is set in `.env`
2. Clear browser cookies and try again

### LLM errors

1. Verify the configured API key is valid
2. If using a local OpenAI-compatible model, set `DEFAULT_MODEL=ollama/<model>` and `OLLAMA_BASE_URL`
