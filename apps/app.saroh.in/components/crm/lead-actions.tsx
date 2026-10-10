"use client";

import { Button } from "@saroh/ui/button";
import { useId, useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import type { ComposerGate } from "@/lib/messages/composer-gate";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";

import { ActivityComposer } from "./activity-composer";
import { ComposerNotice } from "./composer-notice";
import type { MessageDraft } from "./message-composer";
import { BLANK_MESSAGE, MessageComposer } from "./message-composer";
import { TaskForm } from "./task-form";

type Action = "note" | "task" | "message";

/**
 * What can be done on a lead, as one row of buttons over its history: the
 * page reads first (messages, activity), and each button opens a side sheet
 * holding its form. Add note is the primary one: writing down what was just
 * said is what happens after every call or visit, and it needs no provider,
 * plan or consent. Follow-up and message are outline.
 *
 * A sheet closes on success, when its form's own toast says what happened
 * and the page refresh puts the new item in the history. A refusal leaves it
 * open with what was typed. A message is held ten seconds first: its sheet
 * closes, and a refusal or an Undo opens it again with what was written.
 *
 * Send message is never a dead button. With Communications off, someone who
 * may turn it on sees it disabled with where to do that; anyone else sees no
 * button, as they saw no composer before (UX-067). A lead with no contact
 * has it disabled with that reason. A channel with nothing connected says so
 * inside the sheet, in place of the fields (`MessageComposer`).
 */
export function LeadActions({
    leadId,
    contactId,
    consent,
    gates,
    canLog = true,
    canMessage = true,
}: {
    /**
     * `activity:write`: may add a note or a follow-up. Without it neither
     * button is drawn. The page says why in its read-only note.
     */
    canLog?: boolean;
    /** `message:write`: may send this lead's contact a message. */
    canMessage?: boolean;
    leadId: string;
    /** The lead's contact; null when none is linked. */
    contactId: string | null;
    /** Current consent status per channel; absent = allowed. */
    consent: Partial<Record<MessageChannel, ConsentStatus>>;
    /** Per channel, whether a message can be sent (`composerGate`). */
    gates: Record<MessageChannel, ComposerGate>;
}) {
    const [open, setOpen] = useState<Action | null>(null);
    // The message being written outlives its sheet: see `MessageComposer`.
    const [message, setMessage] = useState<MessageDraft>(BLANK_MESSAGE);
    const reasonId = useId();
    const done = () => setOpen(null);

    const off = gates.EMAIL.kind === "off" ? gates.EMAIL : null;
    // Why Send message can't open; null when it can.
    const blocked = off ? (
        off.canManage ? (
            <ComposerNotice gate={off} />
        ) : null
    ) : contactId ? null : (
        <p className="text-sm text-muted-foreground">
            Link a contact to this lead to send a message.
        </p>
    );
    const hidden = !canMessage || (off !== null && !off.canManage);

    // Nothing this person may do here: no row of buttons that only refuse.
    if (!canLog && hidden) return null;

    return (
        <div className="mb-8 grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
                {canLog ? (
                    <>
                        <FormSheet
                            open={open === "note"}
                            trigger={
                                <Button className="wk-press">Add note</Button>
                            }
                            title="Add note"
                            description="Write down a call, a visit or anything the team should remember about this lead. Only your team sees it."
                            onOpen={() => setOpen("note")}
                            onClose={done}
                        >
                            <ActivityComposer leadId={leadId} onDone={done} />
                        </FormSheet>

                        <FormSheet
                            open={open === "task"}
                            trigger={
                                <Button variant="outline" className="wk-press">
                                    Schedule follow-up
                                </Button>
                            }
                            title="Schedule follow-up"
                            description="Say what to do next and when. It shows in this lead's activity with its due date."
                            onOpen={() => setOpen("task")}
                            onClose={done}
                        >
                            <TaskForm leadId={leadId} onDone={done} />
                        </FormSheet>
                    </>
                ) : null}

                {hidden ? null : blocked || !contactId ? (
                    <Button
                        variant="outline"
                        disabled
                        aria-describedby={reasonId}
                    >
                        Send message
                    </Button>
                ) : (
                    <FormSheet
                        open={open === "message"}
                        trigger={
                            <Button variant="outline" className="wk-press">
                                Send message
                            </Button>
                        }
                        title="Send message"
                        description="Write to this lead's contact by email or WhatsApp. How it was delivered shows under Messages."
                        dirty={
                            message.subject.trim() !== "" ||
                            message.body.trim() !== ""
                        }
                        onOpen={() => setOpen("message")}
                        // Cancel, Escape and the close button drop it.
                        onClose={() => {
                            setMessage(BLANK_MESSAGE);
                            done();
                        }}
                    >
                        <MessageComposer
                            leadId={leadId}
                            contactId={contactId}
                            consent={consent}
                            gates={gates}
                            draft={message}
                            onDraft={setMessage}
                            onDone={done}
                            onReopen={() => setOpen("message")}
                        />
                    </FormSheet>
                )}
            </div>
            {blocked && !hidden ? <div id={reasonId}>{blocked}</div> : null}
        </div>
    );
}
