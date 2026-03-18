import type { LLMToolDefinition } from "@openviktor/shared";
import type { ToolExecutor } from "../registry.js";

type TelegramToolName =
	| "coworker_send_telegram_message"
	| "coworker_edit_telegram_message"
	| "coworker_delete_telegram_message";

interface TelegramApiResponse<T> {
	ok: boolean;
	result?: T;
	description?: string;
}

interface TelegramMessageResult {
	message_id: number;
	chat: {
		id: number;
	};
}

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_MAX_LENGTH = 4096;

export const coworkerSendTelegramMessageDefinition: LLMToolDefinition = {
	name: "coworker_send_telegram_message",
	description:
		"Send a Telegram message. Use plain text. Set reply_to_message_id to reply in the current conversation thread.",
	input_schema: {
		type: "object",
		properties: {
			chat_id: { type: "string", description: "Telegram chat ID" },
			text: { type: "string", description: "Plain text message to send" },
			reply_to_message_id: {
				type: "integer",
				description: "Optional Telegram message ID to reply to",
			},
			disable_notification: {
				type: "boolean",
				description: "Send silently without notification",
				default: false,
			},
		},
		required: ["chat_id", "text"],
	},
};

export const coworkerEditTelegramMessageDefinition: LLMToolDefinition = {
	name: "coworker_edit_telegram_message",
	description: "Edit a Telegram message previously sent by the bot.",
	input_schema: {
		type: "object",
		properties: {
			chat_id: { type: "string", description: "Telegram chat ID" },
			message_id: { type: "integer", description: "Telegram message ID to edit" },
			text: { type: "string", description: "Replacement plain text message" },
		},
		required: ["chat_id", "message_id", "text"],
	},
};

export const coworkerDeleteTelegramMessageDefinition: LLMToolDefinition = {
	name: "coworker_delete_telegram_message",
	description: "Delete a Telegram message previously sent by the bot.",
	input_schema: {
		type: "object",
		properties: {
			chat_id: { type: "string", description: "Telegram chat ID" },
			message_id: { type: "integer", description: "Telegram message ID to delete" },
		},
		required: ["chat_id", "message_id"],
	},
};

function toInteger(value: unknown, field: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string" && /^\d+$/.test(value)) return Number.parseInt(value, 10);
	throw new Error(`${field} must be an integer`);
}

function normalizeChatId(value: unknown): string {
	if (typeof value === "string" && value.trim().length > 0) return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	throw new Error("chat_id is required");
}

function chunkTelegramMessage(text: string): string[] {
	if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

	const chunks: string[] = [];
	let remaining = text;

	while (remaining.length > TELEGRAM_MAX_LENGTH) {
		let splitAt = remaining.lastIndexOf("\n\n", TELEGRAM_MAX_LENGTH);
		if (splitAt === -1 || splitAt < TELEGRAM_MAX_LENGTH * 0.3) {
			splitAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_LENGTH);
		}
		if (splitAt === -1 || splitAt < TELEGRAM_MAX_LENGTH * 0.3) {
			splitAt = remaining.lastIndexOf(" ", TELEGRAM_MAX_LENGTH);
		}
		if (splitAt === -1 || splitAt < TELEGRAM_MAX_LENGTH * 0.3) {
			splitAt = TELEGRAM_MAX_LENGTH;
		}

		chunks.push(remaining.slice(0, splitAt).trimEnd());
		remaining = remaining.slice(splitAt).trimStart();
	}

	if (remaining.length > 0) {
		chunks.push(remaining);
	}

	return chunks;
}

async function telegramApiCall<T>(
	token: string,
	method: string,
	body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
	try {
		const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${token}/${method}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json; charset=utf-8",
			},
			body: JSON.stringify(body),
		});
		const payload = (await response.json()) as TelegramApiResponse<T>;
		if (!response.ok) {
			return {
				ok: false,
				description:
					payload.description ?? `Telegram API HTTP ${response.status}: ${response.statusText}`,
			};
		}
		if (!payload.ok) {
			return {
				ok: false,
				description: payload.description ?? `Telegram API error (${method})`,
			};
		}
		return payload;
	} catch (error) {
		return {
			ok: false,
			description: error instanceof Error ? error.message : String(error),
		};
	}
}

function createCoworkerSendTelegramMessageExecutor(telegramToken: string): ToolExecutor {
	return async (args) => {
		try {
			const chatId = normalizeChatId(args.chat_id);
			const text = String(args.text ?? "").trim();
			if (!text) {
				return { output: null, durationMs: 0, error: "text is required" };
			}

			const replyToMessageId = toInteger(args.reply_to_message_id, "reply_to_message_id");
			const disableNotification = args.disable_notification === true;

			const sentMessages: Array<{ message_id: number; chat_id: string }> = [];
			for (const chunk of chunkTelegramMessage(text)) {
				const response = await telegramApiCall<TelegramMessageResult>(telegramToken, "sendMessage", {
					chat_id: chatId,
					text: chunk,
					disable_notification: disableNotification,
					...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
				});
				if (!response.ok || !response.result) {
					return {
						output: null,
						durationMs: 0,
						error: response.description ?? "Failed to send Telegram message",
					};
				}
				sentMessages.push({
					message_id: response.result.message_id,
					chat_id: String(response.result.chat.id),
				});
			}

			return {
				output: {
					ok: true,
					messages: sentMessages,
					message_id: sentMessages[sentMessages.length - 1]?.message_id ?? null,
				},
				durationMs: 0,
			};
		} catch (error) {
			return {
				output: null,
				durationMs: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};
}

function createCoworkerEditTelegramMessageExecutor(telegramToken: string): ToolExecutor {
	return async (args) => {
		try {
			const chatId = normalizeChatId(args.chat_id);
			const messageId = toInteger(args.message_id, "message_id");
			const text = String(args.text ?? "").trim();
			if (!messageId) {
				return { output: null, durationMs: 0, error: "message_id is required" };
			}
			if (!text) {
				return { output: null, durationMs: 0, error: "text is required" };
			}

			const response = await telegramApiCall<TelegramMessageResult>(
				telegramToken,
				"editMessageText",
				{
					chat_id: chatId,
					message_id: messageId,
					text,
				},
			);
			if (!response.ok) {
				return {
					output: null,
					durationMs: 0,
					error: response.description ?? "Failed to edit Telegram message",
				};
			}

			return {
				output: {
					ok: true,
					chat_id: chatId,
					message_id: messageId,
				},
				durationMs: 0,
			};
		} catch (error) {
			return {
				output: null,
				durationMs: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};
}

function createCoworkerDeleteTelegramMessageExecutor(telegramToken: string): ToolExecutor {
	return async (args) => {
		try {
			const chatId = normalizeChatId(args.chat_id);
			const messageId = toInteger(args.message_id, "message_id");
			if (!messageId) {
				return { output: null, durationMs: 0, error: "message_id is required" };
			}

			const response = await telegramApiCall<boolean>(telegramToken, "deleteMessage", {
				chat_id: chatId,
				message_id: messageId,
			});
			if (!response.ok) {
				return {
					output: null,
					durationMs: 0,
					error: response.description ?? "Failed to delete Telegram message",
				};
			}

			return {
				output: {
					ok: true,
					chat_id: chatId,
					message_id: messageId,
				},
				durationMs: 0,
			};
		} catch (error) {
			return {
				output: null,
				durationMs: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};
}

export function createTelegramToolExecutors(telegramToken: string): {
	[key in TelegramToolName]: ToolExecutor;
} {
	return {
		coworker_send_telegram_message: createCoworkerSendTelegramMessageExecutor(telegramToken),
		coworker_edit_telegram_message: createCoworkerEditTelegramMessageExecutor(telegramToken),
		coworker_delete_telegram_message: createCoworkerDeleteTelegramMessageExecutor(telegramToken),
	};
}
