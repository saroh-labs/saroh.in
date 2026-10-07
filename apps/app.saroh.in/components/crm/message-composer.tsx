"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess, showWarning } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { sendMessage } from "@/lib/messages/actions";
import type { ComposerGate } from "@/lib/messages/composer-gate";
import { sendFailureWords } from "@/lib/messages/composer-gate";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";
import { CHANNEL_LABEL, MESSAGE_CHANNELS } from "@/lib/messages/constants";

import { ComposerNotice } from "./composer-notice";

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
 *
 * A channel that can't send (no provider connected, or the plan doesn't
 * let the business connect one, UX-067) shows why and the way on in place
 * of the subject, body and Send (`gates`), so nobody writes a whole message
 * into a refusal; a refusal that still comes is said in the owner's words.
 */
export function MessageComposer({
    leadId,
    contactId,
    consent,
    gates,
}: {
    leadId: string;
    contactId: string;
    /** Per channel, whether it can send; absent, every channel composes. */
    gates?: Partial<Record<MessageChannel, ComposerGate>>;
    /** Current consent status per channel; absent = allowed. */
    consent: Partial<Record<MessageChannel, ConsentStatus>>;
}) {
    const router = useRouter();
    const [channel, setChannel] = useState<MessageChannel>("EMAIL");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);

    const revoked = consent[channel] === "REVOKED";
    const gate: ComposerGate = gates?.[channel] ?? { kind: "compose" };

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = body.trim();
        if (!text || gate.kind !== "compose") return;
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
            showError(sendFailureWords(res.error, channel));
            return;
        }
        setSubject("");
        setBody("");
        if (res.data.status === "SUPPRESSED") {
            showWarning("Message suppressed — consent is revoked");
        } else {
            showSuccess("Message queued");
        }
        router.refresh();
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-2">
            <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Channel</span>
                <OptionSelect
                    aria-label="Message channel"
                    value={channel}
                    disabled={busy}
                    onValueChange={setChannel}
                    options={MESSAGE_CHANNELS.map((c) => ({
                        value: c,
                        label: CHANNEL_LABEL[c],
                    }))}
                    className="w-40"
                />
            </div>

            {gate.kind !== "compose" ? <ComposerNotice gate={gate} /> : null}

            {gate.kind === "compose" && channel === "EMAIL" && (
                <Input
                    aria-label="Subject"
                    placeholder="Subject (optional)"
                    value={subject}
                    disabled={busy}
                    onChange={(e) => setSubject(e.target.value)}
                />
            )}

            {gate.kind === "compose" ? (
                <Textarea
                    aria-label="Message body"
                    placeholder="Write your message…"
                    value={body}
                    disabled={busy}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                />
            ) : null}

            {gate.kind === "compose" && revoked && (
                <p className="text-xs text-destructive">
                    This contact has revoked {channel} consent — sending will be
                    suppressed (recorded, but not delivered).
                </p>
            )}

            {gate.kind === "compose" ? (
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
            ) : null}
        </form>
    );
}
