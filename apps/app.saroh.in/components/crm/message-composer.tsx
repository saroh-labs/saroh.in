"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess, showWarning } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
    ACTION_SHEET_BODY,
    ACTION_SHEET_FORM,
    ActionSheetFooter,
} from "@/components/shared/action-sheet";
import { OptionSelect } from "@/components/shared/option-select";
import { sendMessage } from "@/lib/messages/actions";
import type { ComposerGate } from "@/lib/messages/composer-gate";
import { sendFailureWords } from "@/lib/messages/composer-gate";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";
import { CHANNEL_LABEL, MESSAGE_CHANNELS } from "@/lib/messages/constants";

import { ComposerNotice } from "./composer-notice";

/**
 * Compose + send a message to a lead's contact (S6-002), drawn inside the
 * lead's "Send message" sheet. Picks a channel (EMAIL shows a subject field;
 * WHATSAPP does not), then queues the send via the `sendMessage` server
 * action (`message:write`). Delivery is async: the api returns the message
 * QUEUED and the job worker later drives it to SENT/FAILED — this composer
 * never fakes a sent state, it closes the sheet (`onDone`) and refreshes so
 * the history panel shows the CURRENT delivery status. A refusal is a toast
 * and the sheet stays open with what was written.
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
    onDone,
    onDirtyChange,
}: {
    leadId: string;
    contactId: string;
    /** Per channel, whether it can send; absent, every channel composes. */
    gates?: Partial<Record<MessageChannel, ComposerGate>>;
    /** Current consent status per channel; absent = allowed. */
    consent: Partial<Record<MessageChannel, ConsentStatus>>;
    /** The message was queued (or recorded as suppressed): close the sheet. */
    onDone: () => void;
    /** Something is written, so a stray press outside must not close it. */
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const router = useRouter();
    const [channel, setChannel] = useState<MessageChannel>("EMAIL");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);
    const id = useId();

    const revoked = consent[channel] === "REVOKED";
    const gate: ComposerGate = gates?.[channel] ?? { kind: "compose" };
    const composes = gate.kind === "compose";

    const write = (next: { subject?: string; body?: string }) => {
        const s = next.subject ?? subject;
        const b = next.body ?? body;
        setSubject(s);
        setBody(b);
        onDirtyChange?.(s.trim() !== "" || b.trim() !== "");
    };

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = body.trim();
        if (!text || !composes) return;
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
        if (res.data.status === "SUPPRESSED") {
            showWarning("Message suppressed: consent is revoked");
        } else {
            showSuccess("Message queued");
        }
        onDone();
        router.refresh();
    }

    return (
        <form onSubmit={onSubmit} className={ACTION_SHEET_FORM}>
            <div className={ACTION_SHEET_BODY}>
                <div className="grid gap-2">
                    <Label htmlFor={`${id}-channel`}>Channel</Label>
                    <OptionSelect
                        id={`${id}-channel`}
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

                {!composes ? <ComposerNotice gate={gate} /> : null}

                {composes && channel === "EMAIL" && (
                    <div className="grid gap-2">
                        <Label htmlFor={`${id}-subject`}>
                            Subject (optional)
                        </Label>
                        <Input
                            id={`${id}-subject`}
                            value={subject}
                            disabled={busy}
                            onChange={(e) => write({ subject: e.target.value })}
                        />
                    </div>
                )}

                {composes ? (
                    <div className="grid gap-2">
                        <Label htmlFor={`${id}-body`}>Message</Label>
                        <Textarea
                            id={`${id}-body`}
                            placeholder="Write your message…"
                            value={body}
                            disabled={busy}
                            onChange={(e) => write({ body: e.target.value })}
                            rows={8}
                        />
                    </div>
                ) : null}

                {composes && revoked && (
                    <p className="text-xs text-destructive">
                        This contact has revoked {CHANNEL_LABEL[channel]}{" "}
                        consent. Sending will be suppressed (recorded, but not
                        delivered).
                    </p>
                )}
            </div>

            {composes ? (
                <ActionSheetFooter busy={busy}>
                    <Button
                        type="submit"
                        className="wk-press"
                        disabled={busy || !body.trim()}
                    >
                        {busy ? "Sending…" : "Send message"}
                    </Button>
                </ActionSheetFooter>
            ) : (
                <ActionSheetFooter cancel="Close" />
            )}
        </form>
    );
}
