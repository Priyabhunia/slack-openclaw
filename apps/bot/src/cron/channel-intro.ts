export function buildChannelIntroPrompt(runCount: number): string {
	return `You are running a Telegram group introduction.

This is run #${runCount + 1}. If you are already established in the relevant group chats, keep this brief or skip sending.

Before you start:
1. Call \`read_learnings\`.
2. Call \`list_skills\` and load the most relevant company or team skills with \`read_skill\`.

Message design:
- Send a single plain-text introduction with \`coworker_send_telegram_message\`.
- Lead with practical value.
- Mention 3-5 concrete things you can do with the tools and integrations available.
- End with one copy-pasteable example request.

Do not send generic marketing copy. Keep it specific to the workspace.`;
}
