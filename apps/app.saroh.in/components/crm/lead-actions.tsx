"use client";

import { Button } from "@saroh/ui/button";
import { Sheet, SheetTrigger } from "@saroh/ui/sheet";
import { useId, useState } from "react";

import { ActionSheetContent } from "@/components/shared/action-sheet";
import type { ComposerGate } from "@/lib/messages/composer-gate";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";

import { ActivityComposer } from "./activity-composer";
import { ComposerNotice } from "./composer-notice";
import { MessageComposer } from "./message-composer";
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
 * open with what was typed.
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
}: {
    leadId: string;
    /** The lead's contact; null when none is linked. */
    contactId: string | null;
    /** Current consent status per channel; absent = allowed. */
    consent: Partial<Record<MessageChannel, ConsentStatus>>;
    /** Per channel, whether a message can be sent (`composerGate`). */
    gates: Record<MessageChannel, ComposerGate>;
}) {
    const [open, setOpen] = useState<Action | null>(null);
    const [dirty, setDirty] = useState(false);
    const reasonId = useId();

    const toggle = (action: Action) => (next: boolean) => {
        setOpen(next ? action : null);
        setDirty(false);
    };
    const done = () => {
        setOpen(null);
        setDirty(false);
    };

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
    const hidden = off !== null && !off.canManage;

    return (
        <div className="mb-8 grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <Sheet open={open === "note"} onOpenChange={toggle("note")}>
                    <SheetTrigger asChild>
                        <Button className="wk-press">Add note</Button>
                    </SheetTrigger>
                    <ActionSheetContent
                        title="Add note"
                        description="Write down a call, a visit or anything the team should remember about this lead. Only your team sees it."
                        dirty={dirty}
                    >
                        <ActivityComposer
                            leadId={leadId}
                            onDone={done}
                            onDirtyChange={setDirty}
                        />
                    </ActionSheetContent>
                </Sheet>

                <Sheet open={open === "task"} onOpenChange={toggle("task")}>
                    <SheetTrigger asChild>
                        <Button variant="outline" className="wk-press">
                            Schedule follow-up
                        </Button>
                    </SheetTrigger>
                    <ActionSheetContent
                        title="Schedule follow-up"
                        description="Say what to do next and when. It shows in this lead's activity with its due date."
                        dirty={dirty}
                    >
                        <TaskForm
                            leadId={leadId}
                            onDone={done}
                            onDirtyChange={setDirty}
                        />
                    </ActionSheetContent>
                </Sheet>

                {hidden ? null : blocked || !contactId ? (
                    <Button
                        variant="outline"
                        disabled
                        aria-describedby={reasonId}
                    >
                        Send message
                    </Button>
                ) : (
                    <Sheet
                        open={open === "message"}
                        onOpenChange={toggle("message")}
                    >
                        <SheetTrigger asChild>
                            <Button variant="outline" className="wk-press">
                                Send message
                            </Button>
                        </SheetTrigger>
                        <ActionSheetContent
                            title="Send message"
                            description="Write to this lead's contact by email or WhatsApp. How it was delivered shows under Messages."
                            dirty={dirty}
                        >
                            <MessageComposer
                                leadId={leadId}
                                contactId={contactId}
                                consent={consent}
                                gates={gates}
                                onDone={done}
                                onDirtyChange={setDirty}
                            />
                        </ActionSheetContent>
                    </Sheet>
                )}
            </div>
            {blocked ? <div id={reasonId}>{blocked}</div> : null}
        </div>
    );
}
