import { Api } from "telegram";

export interface MessageGroup {
  /** The message that carries the text (or the first message if none has text) */
  primary: Api.Message;
  /** All messages in the group (including primary), ordered oldest-first */
  all: Api.Message[];
}

/**
 * Groups an array of messages by `groupedId`.
 * Messages without `groupedId` become their own single-message group.
 * Returns groups in the same order as the first message of each group appeared.
 */
export function groupMessages(messages: Api.Message[]): MessageGroup[] {
  const groups = new Map<string, Api.Message[]>();
  const order: string[] = [];

  for (const msg of messages) {
    const key = msg.groupedId ? msg.groupedId.toString() : `single_${msg.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(msg);
  }

  return order.map((key) => {
    const all = groups.get(key)!;
    // The primary message is the one with text, or the first one
    const primary = all.find((m) => m.message?.trim()) || all[0];
    return { primary, all };
  });
}
