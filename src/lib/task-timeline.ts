import { toTaskStreamActivityItem } from "@/lib/task-activity-mapper";
import { parseOpenCodeEventPayload } from "@/shared/task-stream-events";

import type { TaskStreamActivityItem } from "@/components/task-stream-activity";
import type { TaskStreamEvent } from "@/shared/task-stream-events";

export type AssistantMessageSnapshot = {
    content: string;
    createdAt: number;
};

export type ChronologicalActivityItem = TaskStreamActivityItem & {
    stateKey: string;
    createdAt: number;
};

export type TimelineEntry =
    | {
          type: "message";
          id: string;
          createdAt: number;
          role: string;
          content: string;
      }
    | {
          type: "activity";
          id: string;
          createdAt: number;
          item: TaskStreamActivityItem;
      }
    | {
          type: "activity-group";
          id: string;
          createdAt: number;
          items: TaskStreamActivityItem[];
      }
    | {
          type: "assistant-draft";
          id: string;
          createdAt: number;
          content: string;
      };

export function getLatestAssistantMessage(
    messages: Array<{ role: string; content: string; created_at: unknown }>,
): AssistantMessageSnapshot | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role !== "assistant") {
            continue;
        }

        const content = message.content.trim();
        const createdAt = toTimestampOrNull(message.created_at);
        if (content.length > 0 && createdAt !== null) {
            return { content, createdAt };
        }
    }

    return null;
}

export function getLatestStreamAssistantPreview(
    events: TaskStreamEvent[],
): AssistantMessageSnapshot | null {
    const messageRoleById = new Map<string, string>();
    let latest: AssistantMessageSnapshot | null = null;

    for (const event of events) {
        if (event.kind === "assistant") {
            const content = event.payload.trim();
            if (content.length > 0) {
                latest = { content, createdAt: event.createdAt };
            }
            continue;
        }

        const parsed = parseOpenCodeEventPayload(event);
        if (!parsed) {
            continue;
        }

        if (parsed.type === "message.updated") {
            const { info } = parsed.properties;
            if (info.id && info.role) {
                messageRoleById.set(info.id, info.role);
            }
            continue;
        }

        if (parsed.type === "message.part.updated") {
            const { part } = parsed.properties;
            if (part.type !== "text") {
                continue;
            }

            const role = messageRoleById.get(part.messageID);
            if (role !== "assistant") {
                continue;
            }

            if (part.text) {
                latest = { content: part.text, createdAt: event.createdAt };
            }
        }
    }

    return latest;
}

export function buildTaskStreamActivityItems(
    events: TaskStreamEvent[],
): ChronologicalActivityItem[] {
    const byStateKey = new Map<string, ChronologicalActivityItem>();
    const orderedStateKeys: string[] = [];

    for (const event of events) {
        const item = toTaskStreamActivityItem(event);
        if (!item) {
            continue;
        }

        const current = byStateKey.get(item.stateKey);
        if (!current) {
            byStateKey.set(item.stateKey, item);
            orderedStateKeys.push(item.stateKey);
            continue;
        }

        byStateKey.set(item.stateKey, {
            ...current,
            ...item,
            id: current.id,
            stateKey: current.stateKey,
            createdAt: current.createdAt,
        });
    }

    return orderedStateKeys
        .map((stateKey) => byStateKey.get(stateKey))
        .filter((item): item is ChronologicalActivityItem => item !== undefined)
        .toSorted((a, b) => a.createdAt - b.createdAt);
}

export function buildChronologicalTimeline(args: {
    messages: Array<{ id: string; role: string; content: string; created_at: unknown }>;
    activityItems: ChronologicalActivityItem[];
    streamAssistantPreview: AssistantMessageSnapshot | null;
    persistedAssistantMessage: AssistantMessageSnapshot | null;
}): TimelineEntry[] {
    const sortable: Array<{ order: number; item: TimelineEntry }> = [];
    let order = 0;

    for (const message of args.messages) {
        const createdAt = toTimestampOrNull(message.created_at);
        if (createdAt === null) {
            continue;
        }

        sortable.push({
            order,
            item: {
                type: "message",
                id: message.id,
                createdAt,
                role: message.role,
                content: message.content,
            },
        });
        order += 1;
    }

    for (const activity of args.activityItems) {
        sortable.push({
            order,
            item: {
                type: "activity",
                id: activity.id,
                createdAt: activity.createdAt,
                item: {
                    id: activity.id,
                    icon: activity.icon,
                    label: activity.label,
                    details: activity.details,
                    tone: activity.tone,
                    spinning: activity.spinning,
                },
            },
        });
        order += 1;
    }

    if (
        args.streamAssistantPreview &&
        args.streamAssistantPreview.content !== (args.persistedAssistantMessage?.content ?? "")
    ) {
        sortable.push({
            order,
            item: {
                type: "assistant-draft",
                id: `stream-assistant-${args.streamAssistantPreview.createdAt}`,
                createdAt: args.streamAssistantPreview.createdAt,
                content: args.streamAssistantPreview.content,
            },
        });
    }

    const sorted = sortable.toSorted((a, b) => {
        if (a.item.createdAt === b.item.createdAt) {
            return a.order - b.order;
        }
        return a.item.createdAt - b.item.createdAt;
    });

    return groupTimelineActivities(sorted.map((entry) => entry.item));
}

function groupTimelineActivities(entries: TimelineEntry[]): TimelineEntry[] {
    const result: TimelineEntry[] = [];
    let pendingActivities: Array<TimelineEntry & { type: "activity" }> = [];

    for (const entry of entries) {
        if (entry.type === "activity") {
            pendingActivities.push(entry);
            continue;
        }

        if (pendingActivities.length > 0) {
            if (entry.type === "message" && entry.role === "assistant") {
                result.push({
                    type: "activity-group",
                    id: `group-${pendingActivities[0].id}`,
                    createdAt: pendingActivities[0].createdAt,
                    items: pendingActivities.map((a) => a.item),
                });
            } else {
                for (const a of pendingActivities) {
                    result.push(a);
                }
            }
            pendingActivities = [];
        }

        result.push(entry);
    }

    for (const a of pendingActivities) {
        result.push(a);
    }

    return result;
}

export function getLatestUserMessageCreatedAt(
    messages: Array<{ role: string; created_at: unknown }>,
): number | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role !== "user") {
            continue;
        }

        const createdAt = toTimestampOrNull(message.created_at);
        if (createdAt !== null) {
            return createdAt;
        }
    }

    return null;
}

function toTimestampOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "bigint") {
        const asNumber = Number(value);
        return Number.isFinite(asNumber) ? asNumber : null;
    }

    if (typeof value === "string" && value.length > 0) {
        const asNumber = Number(value);
        return Number.isFinite(asNumber) ? asNumber : null;
    }

    return null;
}
