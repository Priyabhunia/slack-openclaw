import type { TriggerType } from "@openviktor/shared";

export interface ActiveThreadInfo {
	path: string;
	title: string | null;
	status: string;
}

export interface PromptContext {
	workspaceName: string;
	channel: string;
	slackThreadTs?: string;
	userMessageTs?: string;
	triggerType: TriggerType;
	userName?: string;
	skillCatalog?: string[];
	integrationCatalog?: string[];
	cronJobName?: string;
	cronAgentPrompt?: string;
	cronRunCount?: number;
	activeThreads?: ActiveThreadInfo[];
	threadId?: string;
	heartbeatPrompt?: string;
	discoveryPrompt?: string;
	threadPath?: string;
	onboardingPrompt?: string;
	channelIntroPrompt?: string;
}

function triggerLabel(triggerType: TriggerType): string {
	switch (triggerType) {
		case "MENTION":
			return "Mention or reply";
		case "DM":
			return "Direct message";
		case "CRON":
			return "Scheduled cron job";
		case "HEARTBEAT":
			return "Heartbeat check-in";
		case "DISCOVERY":
			return "Discovery";
		case "ONBOARDING":
			return "First-install onboarding";
		case "MANUAL":
			return "Manual trigger";
		case "SPAWN":
			return "Spawned agent thread";
		default:
			return `Unknown (${triggerType})`;
	}
}

function buildSpecializedPrompt(name: string, prompt: string, preamble?: string): string {
	const lines = [`You are OpenViktor, an AI coworker in the "${name}" workspace on Telegram.`];
	if (preamble) lines.push(preamble);
	lines.push("", "## Safety", ...buildSafetyRules(), "", prompt);
	return lines.join("\n");
}

function resolveSpecializedPrompt(ctx: PromptContext): string | null {
	if (ctx.onboardingPrompt) {
		return buildSpecializedPrompt(
			ctx.workspaceName,
			ctx.onboardingPrompt,
			"This is your first interaction with this workspace. Make a strong first impression.",
		);
	}
	if (ctx.channelIntroPrompt) {
		return buildSpecializedPrompt(ctx.workspaceName, ctx.channelIntroPrompt);
	}
	if (ctx.heartbeatPrompt) {
		return buildSpecializedPrompt(ctx.workspaceName, ctx.heartbeatPrompt);
	}
	if (ctx.discoveryPrompt) {
		return buildSpecializedPrompt(ctx.workspaceName, ctx.discoveryPrompt);
	}
	return null;
}

export function buildSystemPrompt(ctx: PromptContext): string {
	const specialized = resolveSpecializedPrompt(ctx);
	if (specialized) return specialized;

	if (ctx.triggerType === "CRON") {
		return buildCronPrompt(ctx);
	}

	return buildInteractivePrompt(ctx);
}

function buildCronPrompt(ctx: PromptContext): string {
	const lines = [
		`You are OpenViktor, an AI coworker in the "${ctx.workspaceName}" workspace on Telegram.`,
		`You are executing a scheduled cron job: "${ctx.cronJobName ?? "Unknown"}".`,
		"",
	];

	if (ctx.cronRunCount === 0) {
		lines.push(
			"This is the first time this cron is running. Pay extra attention to setup and baseline data collection.",
			"",
		);
	}

	lines.push(
		"## Guidelines",
		"- Execute the task thoroughly.",
		"- Use available tools to gather information and take action.",
		"- Post results to the appropriate Telegram chat using coworker_send_telegram_message.",
		"- Be concise and direct in any messages you send.",
		"",
		"## Safety",
		...buildSafetyRules(),
		...buildErrorRules(),
	);

	if (ctx.cronAgentPrompt) {
		lines.push("", "## Task", ctx.cronAgentPrompt);
	}

	lines.push(...buildThreadInfoSection(ctx));
	lines.push(...buildActiveThreadsSection(ctx));

	return lines.join("\n");
}

function buildInteractivePrompt(ctx: PromptContext): string {
	const lines = [
		`You are OpenViktor, an AI coworker in the "${ctx.workspaceName}" workspace on Telegram.`,
		"You are helpful, knowledgeable, and concise. You communicate like a capable team member: clear, direct, and friendly.",
		"",
		"## Startup",
		"- Always call `read_learnings` as your first action before responding.",
		"- If you observe something worth remembering, call `write_learning` to persist it.",
		"",
		"## Guidelines",
		"- Be concise and direct. Avoid filler.",
		"- Always send messages using `coworker_send_telegram_message` in plain text.",
		"- Keep formatting simple and readable in Telegram.",
		"- If you do not know something, say so honestly.",
		"- Match the energy of the conversation: casual for casual, detailed for technical.",
		"",
		"## Safety",
		...buildSafetyRules(),
		...buildErrorRules(),
		"",
		"## Response Delivery",
		"- Always send your response using `coworker_send_telegram_message` with the chat_id from your context.",
		"- For reactive responses, use the originating chat_id and reply_to_message_id when available.",
		"- You can send multiple messages, edit prior bot messages, or choose not to reply when no reply is needed.",
		"",
		"## Permissions",
		"- Some tool calls may require user approval. When a tool requires permission, the system posts an approval request.",
		"- Use `submit_permission_request` to check the status of a pending permission request before proceeding.",
		"",
		"## Current Context",
		`- Trigger: ${triggerLabel(ctx.triggerType)}`,
		`- Chat ID: ${ctx.channel}`,
	];

	if (ctx.slackThreadTs) {
		lines.push(`- Reply target: ${ctx.slackThreadTs}`);
	}

	if (ctx.userMessageTs) {
		lines.push(`- User message ID: ${ctx.userMessageTs}`);
	}

	if (ctx.userName) {
		lines.push(`- User: ${ctx.userName}`);
	}

	lines.push(...buildSkillsSection(ctx));
	lines.push(...buildIntegrationsSection(ctx));
	lines.push(...buildThreadInfoSection(ctx, { skipTriggerAndChannel: true }));
	lines.push(...buildActiveThreadsSection(ctx));

	if (ctx.threadPath) {
		lines.push("", "## Your Thread Info", `- Path: ${ctx.threadPath}`);
	}

	return lines.join("\n");
}

function buildErrorRules(): string[] {
	return [
		"- Own errors immediately.",
		"- When something fails, explain the cause and offer a fix in the same message.",
		"- Do not fabricate URLs or data.",
	];
}

function buildSafetyRules(): string[] {
	return [
		"- Always ask for explicit user permission before deleting anything.",
		"- Treat deletion, destruction, permanent removal, or irreversible cleanup of files, messages, records, integrations, or external resources as high risk.",
		"- If a delete action could affect user data, ask first and wait for confirmation in the current thread before proceeding.",
		"- If a tool offers an approval or permission flow for a destructive action, use it instead of proceeding directly.",
	];
}

function buildSkillsSection(ctx: PromptContext): string[] {
	if (!ctx.skillCatalog || ctx.skillCatalog.length === 0) return [];
	const lines = [
		"",
		"## Skills",
		"Before using any specialized tool for the first time in a conversation, call `read_skill` to load the matching skill and follow it.",
	];
	for (const entry of ctx.skillCatalog) {
		lines.push(`- ${entry}`);
	}
	return lines;
}

function buildIntegrationsSection(ctx: PromptContext): string[] {
	const lines = [
		"",
		"## Integrations",
		"You can connect to 3,000+ third-party services via Pipedream.",
		"- Use `list_available_integrations` to search for apps.",
		"- Use `connect_integration` to help users connect new apps.",
		"- Use `read_skill` to load documentation for any connected integration.",
		"",
	];

	if (ctx.integrationCatalog && ctx.integrationCatalog.length > 0) {
		lines.push("Connected integrations:");
		for (const entry of ctx.integrationCatalog) {
			lines.push(`- ${entry}`);
		}
	} else {
		lines.push("Connected integrations: None yet. Use `list_available_integrations` to explore.");
	}

	return lines;
}

function buildThreadInfoSection(
	ctx: PromptContext,
	options?: { skipTriggerAndChannel?: boolean },
): string[] {
	const lines: string[] = ["", "## Your Thread Info"];
	if (!options?.skipTriggerAndChannel) {
		lines.push(`- Trigger: ${triggerLabel(ctx.triggerType)}`);
	}
	if (ctx.threadId) {
		lines.push(`- Thread ID: ${ctx.threadId}`);
	}
	if (!options?.skipTriggerAndChannel && ctx.channel) {
		lines.push(`- Chat ID: ${ctx.channel}`);
	}
	if (ctx.cronJobName) {
		lines.push(`- Cron job: ${ctx.cronJobName}`);
	}
	return lines;
}

function buildActiveThreadsSection(ctx: PromptContext): string[] {
	if (!ctx.activeThreads || ctx.activeThreads.length === 0) return [];
	const lines: string[] = ["", "## Currently Active Threads"];
	for (const thread of ctx.activeThreads) {
		const label = thread.title ? `${thread.path} - ${thread.title}` : thread.path;
		lines.push(`- ${label} (${thread.status.toLowerCase()})`);
	}
	return lines;
}
