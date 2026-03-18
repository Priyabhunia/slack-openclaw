import type { Logger } from "@openviktor/shared";

export interface TelegramUser {
	id: number;
	is_bot: boolean;
	username?: string;
	first_name?: string;
	last_name?: string;
}

export interface TelegramChat {
	id: number;
	type: "private" | "group" | "supergroup" | "channel";
	title?: string;
	username?: string;
	first_name?: string;
	last_name?: string;
}

export interface TelegramMessage {
	message_id: number;
	text?: string;
	caption?: string;
	chat: TelegramChat;
	from?: TelegramUser;
	reply_to_message?: TelegramMessage;
}

export interface TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
	edited_message?: TelegramMessage;
}

interface TelegramResponse<T> {
	ok: boolean;
	result?: T;
	description?: string;
}

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export class TelegramApi {
	constructor(
		private token: string,
		private logger: Logger,
	) {}

	async getMe(): Promise<TelegramUser> {
		return this.call<TelegramUser>("getMe");
	}

	async getUpdates(offset?: number, timeout = 30): Promise<TelegramUpdate[]> {
		return this.call<TelegramUpdate[]>("getUpdates", {
			offset,
			timeout,
			allowed_updates: ["message", "edited_message"],
		});
	}

	async sendMessage(
		chatId: string,
		text: string,
		replyToMessageId?: string,
	): Promise<{ message_id: number }> {
		return this.call<{ message_id: number }>("sendMessage", {
			chat_id: chatId,
			text,
			...(replyToMessageId && /^\d+$/.test(replyToMessageId)
				? { reply_to_message_id: Number.parseInt(replyToMessageId, 10) }
				: {}),
		});
	}

	private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
		const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${this.token}/${method}`, {
			method: body ? "POST" : "GET",
			headers: body ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
			body: body ? JSON.stringify(body) : undefined,
		});

		const payload = (await response.json()) as TelegramResponse<T>;
		if (!response.ok || !payload.ok || payload.result === undefined) {
			const description =
				payload.description ?? `Telegram API HTTP ${response.status}: ${response.statusText}`;
			this.logger.error({ method, description }, "Telegram API request failed");
			throw new Error(description);
		}

		return payload.result;
	}
}
