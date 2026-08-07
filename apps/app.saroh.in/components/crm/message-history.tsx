import { Badge } from "@saroh/ui/badge";

import type { LeadMessage } from "@/lib/messages/service";

/**
 * Message history for a lead (S6-002), newest first. Each row shows the channel,
 * recipient + subject/body, and the CURRENT delivery state — the source of truth
 * for the "owner sees final delivery state" acceptance.
 *
 * Delivery is async: right after a send the message is QUEUED with a QUEUED
 * delivery, and the job worker later drives it to SENT → DELIVERED or
 * FAILED/BOUNCED. This panel reflects whatever state exists NOW (a "queued…"
 * hint on the non-terminal states), never a faked terminal state. A SUPPRESSED
 * message was blocked by the consent gate and has no delivery.
 */

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** Map a delivery/message status to a badge variant. */
function statusVariant(status: string): BadgeVariant {
    switch (status) {
        case "SENT":
        case "DELIVERED":
            return "default";
        case "FAILED":
        case "BOUNCED":
        case "SUPPRESSED":
            return "destructive";
        case "QUEUED":
        default:
            return "outline";
    }
}

/** True while a message/delivery is still working toward a terminal state. */
function isPending(status: string): boolean {
    return status === "QUEUED";
}

/**
 * The status to display for a message: a SUPPRESSED message stands on its own
 * (no delivery); otherwise the latest delivery attempt's status (deliveries come
 * asc by createdAt), falling back to the message status before any delivery row.
 */
function displayStatus(message: LeadMessage): { status: string; at: string } {
    if (message.status === "SUPPRESSED") {
        return { status: "SUPPRESSED", at: message.createdAt };
    }
    const latest = message.deliveries.at(-1);
    if (latest) {
        return { status: latest.status, at: latest.updatedAt };
    }
    return { status: message.status, at: message.createdAt };
}

export function MessageHistory({ messages }: { messages: LeadMessage[] }) {
    if (messages.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
        );
    }

    return (
        <ol className="space-y-3">
            {messages.map((message, index) => {
                const { status, at } = displayStatus(message);
                const latest = message.deliveries.at(-1);
                return (
                    <li
                        key={message.id}
                        style={{ "--wk-i": index } as React.CSSProperties}
                        className="wk-item grid gap-1 rounded-xl border p-3"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">
                                    {message.channel}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                    {message.toAddress}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant={statusVariant(status)}>
                                    {status}
                                </Badge>
                                {isPending(status) && (
                                    <span className="text-xs text-muted-foreground">
                                        queued…
                                    </span>
                                )}
                            </div>
                        </div>

                        {message.subject && (
                            <p className="text-sm font-medium">
                                {message.subject}
                            </p>
                        )}
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {message.body}
                        </p>

                        {latest?.error && (
                            <p className="text-xs text-destructive">
                                {latest.error}
                            </p>
                        )}

                        <p className="text-xs text-muted-foreground">
                            Sent {new Date(message.createdAt).toLocaleString()}
                            {status !== message.status ||
                            message.deliveries.length > 0
                                ? ` · updated ${new Date(at).toLocaleString()}`
                                : ""}
                        </p>
                    </li>
                );
            })}
        </ol>
    );
}
