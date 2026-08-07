"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { sendMessage } from "@/lib/messages/actions";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";
import { MESSAGE_CHANNELS } from "@/lib/messages/constants";

/**
 * Compose + send a message to a lead's contact (S6-002). Picks a channel
 * (EMAIL shows a subject field; WHATSAPP does not), then queues the send via the
 * `sendMessage` server action (`message:write`). Delivery is async: the api
 * returns the message QUEUED and the job worker later drives it to SENT/FAILED —
 * this composer never fakes a sent state, it just refreshes so the history panel
 * shows the CURRENT delivery status.
 *
 * The consent gate is surfaced up front: when the selected channel is REVOKED
 * for this contact, a warning explains that a send will be SUPPRESSED (the api
 * records it but hands nothing to a provider). The send button stays enabled so
 * the (auditable) suppression can still be exercised deliberately.
 */
export function MessageComposer({
    leadId,
    contactId,
    consent,
}: {
    leadId: string;
    contactId: string;
    /** Current consent status per channel; absent = allowed. */
    consent: Partial<Record<MessageChannel, ConsentStatus>>;
}) {
    const router = useRouter();
    const [channel, setChannel] = useState<MessageChannel>("EMAIL");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);

    const revoked = consent[channel] === "REVOKED";

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = body.trim();
        if (!text) return;
        setBusy(true);
        const res = await sendMessage({
            leadId,
            channel,
            contactId,
            subject:
                channel === "EMAIL" && subject.trim()
                    ? subject.trim()
                    : undefined,
            body: text,
        });
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setSubject("");
        setBody("");
        if (res.data.status === "SUPPRESSED") {
            toast.warning("Message suppressed — consent is revoked");
        } else {
            toast.success("Message queued");
        }
        router.refresh();
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-2">
            <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Channel</span>
                <select
                    aria-label="Message channel"
                    value={channel}
                    disabled={busy}
                    onChange={(e) =>
                        setChannel(e.target.value as MessageChannel)
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                    {MESSAGE_CHANNELS.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            </div>

            {channel === "EMAIL" && (
                <Input
                    aria-label="Subject"
                    placeholder="Subject (optional)"
                    value={subject}
                    disabled={busy}
                    onChange={(e) => setSubject(e.target.value)}
                />
            )}

            <Textarea
                aria-label="Message body"
                placeholder="Write your message…"
                value={body}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
            />

            {revoked && (
                <p className="text-xs text-destructive">
                    This contact has revoked {channel} consent — sending will be
                    suppressed (recorded, but not delivered).
                </p>
            )}

            <div className="flex justify-end">
                <Button
                    type="submit"
                    size="sm"
                    className="wk-press"
                    disabled={busy || !body.trim()}
                >
                    {busy ? "Sending…" : "Send message"}
                </Button>
            </div>
        </form>
    );
}
