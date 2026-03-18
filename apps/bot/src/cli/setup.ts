import { existsSync, writeFileSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { generateEncryptionKey } from "@openviktor/shared";

function escapeEnvValue(value: string): string {
	if (/[\s#"'\\]/.test(value) || value.includes("=")) {
		return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
	}
	return value;
}

function findRepoRoot(startDir: string): string {
	let current = resolve(startDir);
	while (true) {
		if (
			existsSync(resolve(current, "docker", "docker-compose.selfhosted.yml")) &&
			existsSync(resolve(current, "package.json"))
		) {
			return current;
		}
		const parent = resolve(current, "..");
		if (parent === current) {
			return startDir;
		}
		current = parent;
	}
}

type SetupFlags = {
	telegramBotToken?: string;
	telegramBotUsername?: string;
	useOllama?: boolean;
	anthropicApiKey?: string;
	openaiApiKey?: string;
	googleAiApiKey?: string;
	ollamaModel?: string;
	ollamaBaseUrl?: string;
	dashboardPassword?: string;
	dbPassword?: string;
	overwrite?: boolean;
	help?: boolean;
};

function parseFlags(argv: string[]): SetupFlags {
	const flags: SetupFlags = {};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];

		switch (arg) {
			case "--telegram-bot-token":
				flags.telegramBotToken = next;
				i++;
				break;
			case "--telegram-bot-username":
				flags.telegramBotUsername = next;
				i++;
				break;
			case "--use-ollama":
				flags.useOllama = true;
				break;
			case "--anthropic-api-key":
				flags.anthropicApiKey = next;
				i++;
				break;
			case "--openai-api-key":
				flags.openaiApiKey = next;
				i++;
				break;
			case "--google-ai-api-key":
				flags.googleAiApiKey = next;
				i++;
				break;
			case "--ollama-model":
				flags.ollamaModel = next;
				i++;
				break;
			case "--ollama-base-url":
				flags.ollamaBaseUrl = next;
				i++;
				break;
			case "--dashboard-password":
				flags.dashboardPassword = next;
				i++;
				break;
			case "--db-password":
				flags.dbPassword = next;
				i++;
				break;
			case "--overwrite":
				flags.overwrite = true;
				break;
			case "--help":
			case "-h":
				flags.help = true;
				break;
		}
	}

	return flags;
}

function printHelp(): void {
	console.log(`
OpenViktor setup

Interactive:
  bun src/cli/setup.ts

Non-interactive:
  bun src/cli/setup.ts --telegram-bot-token <token> --dashboard-password <password> [options]

Options:
  --telegram-bot-token <token>
  --telegram-bot-username <username>
  --use-ollama
  --anthropic-api-key <key>
  --openai-api-key <key>
  --google-ai-api-key <key>
  --ollama-model <model>
  --ollama-base-url <url>
  --dashboard-password <password>
  --db-password <password>
  --overwrite
  --help
`);
}

const flags = parseFlags(process.argv.slice(2));
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;

async function ask(question: string): Promise<string> {
	if (!rl) {
		throw new Error(`Interactive input is unavailable for: ${question}`);
	}
	return new Promise((resolveAnswer) => rl.question(question, (answer) => resolveAnswer(answer.trim())));
}

async function getValue(
	label: string,
	value: string | undefined,
	question: string,
	options?: { optional?: boolean; defaultValue?: string },
): Promise<string> {
	if (value !== undefined && value !== "") {
		return value;
	}
	if (!interactive) {
		if (options?.defaultValue !== undefined) return options.defaultValue;
		if (options?.optional) return "";
		throw new Error(
			`Missing required value for ${label}. Re-run with --help and pass flags, or use an interactive terminal.`,
		);
	}

	const answer = await ask(question);
	if (answer) return answer;
	if (options?.defaultValue !== undefined) return options.defaultValue;
	if (options?.optional) return "";
	throw new Error(`${label} is required`);
}

async function askYesNo(question: string, defaultValue = false): Promise<boolean> {
	if (!interactive) {
		return defaultValue;
	}

	const suffix = defaultValue ? "Y/n" : "y/N";
	const answer = (await ask(`${question} (${suffix}): `)).toLowerCase();
	if (!answer) {
		return defaultValue;
	}
	return answer === "y" || answer === "yes";
}

async function main() {
	if (flags.help) {
		printHelp();
		return;
	}

	console.log("\n  OpenViktor Setup\n");
	console.log("  This wizard configures OpenViktor for Telegram-first self-hosting.\n");

	const repoRoot = findRepoRoot(process.cwd());
	const envPath = resolve(repoRoot, ".env");
	if (existsSync(envPath)) {
		if (flags.overwrite !== true) {
			if (!interactive) {
				throw new Error(".env already exists. Re-run with --overwrite to replace it.");
			}
			const overwrite = await ask("  .env file already exists. Overwrite? (y/N): ");
			if (overwrite.toLowerCase() !== "y") {
				console.log("  Setup cancelled.\n");
				return;
			}
		}
	}

	console.log("\n  Step 1: Telegram Bot");
	console.log("  Create a bot with @BotFather, then paste the HTTP API token here.\n");

	const telegramBotToken = await getValue(
		"TELEGRAM_BOT_TOKEN",
		flags.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN,
		"  Telegram Bot Token: ",
	);
	if (!telegramBotToken.includes(":")) {
		throw new Error("Telegram bot token should look like <id>:<secret>");
	}

	const telegramBotUsername = await getValue(
		"TELEGRAM_BOT_USERNAME",
		flags.telegramBotUsername ?? process.env.TELEGRAM_BOT_USERNAME,
		"  Telegram Bot Username (optional): ",
		{ optional: true },
	);

	console.log("\n  Step 2: LLM Provider");
	console.log("  Choose Ollama for local models, or cloud keys if you need hosted models.\n");

	const useOllama =
		flags.useOllama === true ||
		Boolean(flags.ollamaModel || process.env.OLLAMA_MODEL) ||
		(await askYesNo("  Use Ollama/local model?", true));

	const anthropicKey = useOllama
		? ""
		: await getValue(
				"ANTHROPIC_API_KEY",
				flags.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
				"  Anthropic API Key (optional, press Enter to skip): ",
				{ optional: true },
			);
	const openaiKey = useOllama
		? ""
		: await getValue(
				"OPENAI_API_KEY",
				flags.openaiApiKey ?? process.env.OPENAI_API_KEY,
				"  OpenAI API Key (optional, press Enter to skip): ",
				{ optional: true },
			);
	const googleKey = useOllama
		? ""
		: await getValue(
				"GOOGLE_AI_API_KEY",
				flags.googleAiApiKey ?? process.env.GOOGLE_AI_API_KEY,
				"  Google AI API Key (optional, press Enter to skip): ",
				{ optional: true },
			);
	const ollamaModel = useOllama
		? await getValue(
				"OLLAMA_MODEL",
				flags.ollamaModel ?? process.env.OLLAMA_MODEL,
				"  Ollama model (e.g. llama3.2): ",
			)
		: await getValue(
				"OLLAMA_MODEL",
				flags.ollamaModel ?? process.env.OLLAMA_MODEL,
				"  Ollama model (optional, e.g. llama3.2, press Enter to skip): ",
				{ optional: true },
			);
	const ollamaBaseUrl = ollamaModel
		? await getValue(
				"OLLAMA_BASE_URL",
				flags.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL,
				"  Ollama base URL (default: http://localhost:11434): ",
				{ optional: true, defaultValue: "http://localhost:11434" },
			)
		: "";

	if (!anthropicKey && !openaiKey && !googleKey && !ollamaModel) {
		throw new Error("Provide at least one cloud API key or an Ollama model");
	}

	console.log("\n  Step 3: Dashboard");
	console.log("  Press Enter to auto-generate a dashboard password.\n");

	const dashboardPassword = await getValue(
		"DASHBOARD_PASSWORD",
		flags.dashboardPassword ?? process.env.DASHBOARD_PASSWORD,
		"  Dashboard password (admin login): ",
		{ defaultValue: generateEncryptionKey().slice(0, 24) },
	);

	console.log("\n  Step 4: Database");
	const dbPassword = await getValue(
		"POSTGRES_PASSWORD",
		flags.dbPassword ?? process.env.POSTGRES_PASSWORD,
		"  PostgreSQL password (press Enter for auto-generated): ",
		{ defaultValue: generateEncryptionKey().slice(0, 24) },
	);
	const encryptionKey = generateEncryptionKey();

	const envContent = [
		"# OpenViktor Configuration",
		"# Generated by setup wizard",
		"",
		"# Deployment",
		"DEPLOYMENT_MODE=selfhosted",
		"",
		"# Telegram",
		`TELEGRAM_BOT_TOKEN=${escapeEnvValue(telegramBotToken)}`,
		...(telegramBotUsername
			? [`TELEGRAM_BOT_USERNAME=${escapeEnvValue(telegramBotUsername)}`]
			: []),
		"",
		"# LLM",
		...(anthropicKey ? [`ANTHROPIC_API_KEY=${escapeEnvValue(anthropicKey)}`] : []),
		...(openaiKey ? [`OPENAI_API_KEY=${escapeEnvValue(openaiKey)}`] : []),
		...(googleKey ? [`GOOGLE_AI_API_KEY=${escapeEnvValue(googleKey)}`] : []),
		...(ollamaModel ? [`DEFAULT_MODEL=ollama/${escapeEnvValue(ollamaModel)}`] : []),
		...(ollamaModel && ollamaBaseUrl
			? [`OLLAMA_BASE_URL=${escapeEnvValue(ollamaBaseUrl)}`]
			: []),
		"",
		"# Database",
		`DATABASE_URL=postgresql://openviktor:${encodeURIComponent(dbPassword)}@postgres:5432/openviktor`,
		`POSTGRES_PASSWORD=${escapeEnvValue(dbPassword)}`,
		"",
		"# Redis",
		"REDIS_URL=redis://redis:6379",
		"",
		"# Dashboard",
		"DASHBOARD_AUTH_MODE=basic",
		"DASHBOARD_USERNAME=admin",
		`DASHBOARD_PASSWORD=${escapeEnvValue(dashboardPassword)}`,
		"ENABLE_DASHBOARD=true",
		"",
		"# Security",
		`ENCRYPTION_KEY=${encryptionKey}`,
		"",
		"# Application",
		"NODE_ENV=production",
		"LOG_LEVEL=info",
		"",
	].join("\n");

	writeFileSync(envPath, envContent, "utf-8");
	console.log(`\n  .env written to ${envPath}`);
	console.log("  If you left a password blank, the generated value is stored in that .env file.");
	console.log("\n  Setup complete!");
	console.log("  Start the stack with:");
	console.log("    docker compose -f docker/docker-compose.selfhosted.yml up -d\n");
	console.log("  Then open Telegram, send a message to your bot, and watch OpenViktor reply.");
	console.log("  Dashboard: http://localhost:3001\n");
}

main()
	.catch((err) => {
		console.error(`  Error: ${err.message}`);
		process.exitCode = 1;
	})
	.finally(() => {
		rl?.close();
	});
