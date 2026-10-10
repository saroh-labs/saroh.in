"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showWarning } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { FormSheetBody, FormSheetFoot } from "@/components/shared/form-sheet";
import { OptionSelect } from "@/components/shared/option-select";
import { useHold } from "@/components/shared/use-hold";
import { sendMessage } from "@/lib/messages/actions";
import type { ComposerGate } from "@/lib/messages/composer-gate";
import { sendFailureWords } from "@/lib/messages/composer-gate";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";
import { CHANNEL_LABEL, MESSAGE_CHANNELS } from "@/lib/messages/constants";

import { ComposerNotice } from "./composer-notice";

/** A message as it is being written. */
export interface MessageDraft {
    channel: MessageChannel;
    subject: string;
    body: string;
}

export const BLANK_MESSAGE: MessageDraft = {
    channel: "EMAIL",
    subject: "",
    body: "",
};

/**
 * Compose + send a message to a lead's contact (S6-002), drawn inside the
 * lead's "Send message" sheet. Picks a channel (EMAIL shows a subject field;
 * WHATSAPP does not), then sends through the `sendMessage` server action
 * (`message:write`).
 *
 * A message tells a customer, so it waits ten seconds with Undo
 * (`useHold`): the sheet closes, keeping what was written, and a refusal
 * or an Undo opens it again with that (`onReopen`). Delivery is async: the
 * api returns the message QUEUED and the job worker later drives it to
 * SENT/FAILED, so the history panel shows the CURRENT delivery status.
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
    draft,
    onDraft,
    onDone,
    onReopen,
}: {
    leadId: string;
    contactId: string;
    /** Per channel, whether it can send; absent, every channel composes. */
    gates?: Partial<Record<MessageChannel, ComposerGate>>;
    /** Current consent status per channel; absent = allowed. */
    consent: Partial<Record<MessageChannel, ConsentStatus>>;
    /**
     * What is written, kept by whoever draws the sheet: the sheet closes
     * while the send is held, and opens again on a refusal or an Undo.
     */
    draft: MessageDraft;
    onDraft: (draft: MessageDraft) => void;
    /** The send is held, or the message went: close the sheet. */
    onDone: () => void;
    /** Refused or undone: open the sheet again, with what was written. */
    onReopen: () => void;
}) {
    const router = useRouter();
    const { channel, subject, body } = draft;
    const setChannel = (next: MessageChannel) =>
        onDraft({ ...draft, channel: next });
    const [tried, setTried] = useState(false);
    const { send } = useHold();
    const id = useId();
    const busy = false;

    const revoked = consent[channel] === "REVOKED";
    const gate: ComposerGate = gates?.[channel] ?? { kind: "compose" };
    const composes = gate.kind === "compose";

    const write = (next: { subject?: string; body?: string }) =>
        onDraft({ ...draft, ...next });
    const empty = tried && !body.trim();

    function onSubmit() {
        setTried(true);
        const text = body.trim();
        if (!text || !composes) return;
        let suppressed = false;
        // Closed with what was written kept, for a refusal or an Undo.
        onDone();
        send(`message:${leadId}`, {
            description: `By ${CHANNEL_LABEL[channel]}.`,
            run: async () => {
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
                if (!res.ok) {
                    return {
                        ok: false,
                        error: sendFailureWords(res.error, channel),
                    };
                }
                suppressed = res.data.status === "SUPPRESSED";
                return { ok: true };
            },
            sent: "Message sent.",
            onSent: () => {
                if (suppressed) {
                    showWarning("Message suppressed: consent is revoked");
                }
                onDraft(BLANK_MESSAGE);
                router.refresh();
            },
            onBack: onReopen,
        });
    }

    return (
        <>
            <FormSheetBody className="gap-4">
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
                            aria-invalid={empty || undefined}
                            aria-describedby={
                                empty ? `${id}-problem` : undefined
                            }
                            onChange={(e) => write({ body: e.target.value })}
                            rows={8}
                        />
                        {empty ? (
                            <p
                                id={`${id}-problem`}
                                role="alert"
                                className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                            >
                                Write the message first.
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {composes && revoked && (
                    <p className="text-xs text-destructive">
                        This contact has revoked {CHANNEL_LABEL[channel]}{" "}
                        consent. Sending will be suppressed (recorded, but not
                        delivered).
                    </p>
                )}
            </FormSheetBody>

            {composes ? (
                <FormSheetFoot
                    saveLabel="Send message"
                    savingLabel="Sending…"
                    onSubmit={onSubmit}
                />
            ) : (
                <FormSheetFoot doneOnly doneLabel="Close" />
            )}
        </>
    );
}
