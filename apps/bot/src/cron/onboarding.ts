import type { PrismaClient } from "@openviktor/db";
import type { Logger } from "@openviktor/shared";

interface WorkspaceRecord {
	id: string;
	settings: unknown;
}

export function buildOnboardingPrompt(userMessage: string): string {
	return `You are running first-install onboarding for this Telegram workspace.

Complete these steps before you answer:
1. Call \`read_learnings\`.
2. Use \`quick_ai_search\` to understand the company or project behind this workspace when possible.
3. Create or update a "company" skill with key context using \`write_skill\`.
4. Create or update a "team" skill with what you learn about the user and how they want to work.
5. Respond to the user's actual message using \`coworker_send_telegram_message\`.

Response rules:
- Reference any connected integrations by name when relevant.
- Include 2-3 concrete example requests the user can try next.
- Keep the tone warm, direct, and practical.
- Do not call yourself an assistant. Speak like a capable teammate.

User message: "${userMessage}"`;
}

export async function isOnboardingNeeded(
	prisma: PrismaClient,
	workspace: WorkspaceRecord,
): Promise<boolean> {
	const settings = workspace.settings as Record<string, unknown> | null;
	if (settings?.onboardingCompletedAt) return false;

	const runCount = await prisma.agentRun.count({
		where: { workspaceId: workspace.id },
		take: 1,
	});
	return runCount === 0;
}

export async function markOnboardingComplete(
	prisma: PrismaClient,
	workspace: WorkspaceRecord,
): Promise<void> {
	const existing = (workspace.settings as Record<string, unknown> | null) ?? {};
	await prisma.workspace.update({
		where: { id: workspace.id },
		data: {
			settings: { ...existing, onboardingCompletedAt: new Date().toISOString() },
		},
	});
}

export async function seedChannelIntros(
	_prisma: PrismaClient,
	workspaceId: string,
	logger: Logger,
): Promise<void> {
	logger.info({ workspaceId }, "Channel intro cron skipped for Telegram transport");
}

export function buildProactiveOnboardingPrompt(installerSlackUserId: string): string {
	return `You were just connected to a Telegram workspace. Introduce yourself to the user with ID ${installerSlackUserId}.

Before you send anything:
1. Call \`read_learnings\`.
2. Research the company or project with \`quick_ai_search\` when possible.
3. Write or update "company" and "team" skills with the context you learn.

Then send two Telegram messages:
- Message 1: short introduction, what you help with, and that you are ready in this chat.
- Message 2: 2-3 concrete example prompts tailored to their company or role.

Use \`coworker_send_telegram_message\` and keep the tone direct and useful.`;
}
