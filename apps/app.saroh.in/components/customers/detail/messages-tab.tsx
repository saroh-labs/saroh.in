"use client";

import { formatDate, formatTime } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/money";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { showError } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import {
    markThreadReadAction,
    replyAction,
} from "@/lib/customer-workspace/actions";
import type {
    CustomerThread,
    ThreadMessage,
} from "@/lib/customer-workspace/thread";
import {
    emptyThreadText,
    messageFrom,
    REPLY_MAX,
    replyNote,
} from "@/lib/customer-workspace/thread";

import { UNREACHED } from "@/lib/api/unreached";
import { Field } from "@saroh/ui/field";
import { Empty } from "./parts";

/**
 * Messages on Customer Detail (round-2 A13): the customer's one thread with
 * the business — what they wrote from their account on the business's
 * site, the team's answers, and invoices sent into it — and a reply box for
 * whoever may answer (`message:write`).
 *
 * Opening the tab marks the customer's messages read, so its count clears.
 * A reply shows in their account on the site, and is emailed to them a
 * minute later where the business's own email sends it (DEC-174 U14); the
 * line under the box says which, naming the address.
 */
export function MessagesTab({
    contactId,
    thread,
    firstName,
    timeZone,
    now,
}: {
    contactId: string;
    thread: CustomerThread;
    firstName: string;
    timeZone: string;
    now: Date;
}) {
    const router = useRouter();
    const id = useId();
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState<ThreadMessage[]>([]);
    const marked = useRef(false);
    const text = draft.trim();
    const over = text.length > REPLY_MAX;
    const off = busy || !text || over;

    // Opening it: their messages are read. Once per visit to the tab.
    useEffect(() => {
        if (marked.current || thread.unread === 0) return;
        marked.current = true;
        void markThreadReadAction(contactId).then((res) => {
            if (res.ok) router.refresh();
        });
    }, [contactId, thread.unread, router]);

    async function reply() {
        if (off) return;
        setBusy(true);
        const res = await replyAction(contactId, text).catch(() => ({
            ok: false as const,
            error: UNREACHED,
        }));
        setBusy(false);
        if (!res.ok) return showError(res.error);
        setSent((list) => [...list, res.data]);
        setDraft("");
        router.refresh();
    }

    // What the server read, and what was sent since (until it reads again).
    const known = new Set(thread.messages.map((m) => m.id));
    const messages = [
        ...thread.messages,
        ...sent.filter((m) => !known.has(m.id)),
    ];

    return (
        <>
            <p className="mb-2.5 text-[12.5px] text-muted-foreground">
                {firstName} writes to you from their account on your site. The
                team&apos;s notes are never shown to them.
            </p>
            {thread.earlier ? (
                <p className="mb-2 text-center text-[12px] text-muted-foreground">
                    Older messages aren&apos;t shown.
                </p>
            ) : null}
            {messages.length === 0 ? (
                <Empty data-ph-mask="">
                    {emptyThreadText(thread.signsIn, firstName)}
                </Empty>
            ) : (
                <ol
                    aria-label={`Messages with ${firstName}`}
                    className="m-0 flex list-none flex-col gap-2.5 p-0"
                >
                    {messages.map((m) => {
                        const theirs = m.author === "CUSTOMER";
                        return (
                            <li
                                key={m.id}
                                className={cn(
                                    "flex flex-col",
                                    theirs ? "items-start" : "items-end",
                                )}
                            >
                                <div
                                    className={cn(
                                        "max-w-[80%] whitespace-pre-line break-words rounded-xl px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-foreground",
                                        theirs
                                            ? "rounded-bl-[4px] border border-border bg-card"
                                            : "rounded-br-[4px] bg-muted",
                                    )}
                                >
                                    {m.body}
                                </div>
                                <div className="mt-1 text-[11.5px] text-muted-foreground">
                                    {messageFrom(m, firstName)} ·{" "}
                                    <span className="whitespace-nowrap">
                                        {formatDate(m.at, timeZone, { now })},{" "}
                                        {formatTime(m.at, timeZone)}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            {thread.canReply ? (
                <div className="mt-3.5 rounded-xl border border-border bg-card px-3.5 py-3">
                    <Field
                        holdsData
                        label={`Reply to ${firstName}`}
                        labelHidden
                        className="space-y-0"
                    >
                        <Textarea
                            id={`${id}-reply`}
                            rows={2}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter" &&
                                    (e.metaKey || e.ctrlKey)
                                ) {
                                    e.preventDefault();
                                    void reply();
                                }
                            }}
                            aria-describedby={`${id}-note`}
                            placeholder={`Reply to ${firstName}…`}
                            className="w-full resize-y"
                        />
                    </Field>
                    <div className="mt-2 flex items-center gap-2">
                        <span
                            id={`${id}-note`}
                            data-ph-mask={thread.emailedTo ? "" : undefined}
                            className={cn(
                                "flex-1 text-pretty text-[11.5px]",
                                over
                                    ? "text-destructive-subtle-foreground"
                                    : "text-muted-foreground",
                            )}
                        >
                            {over
                                ? `Over ${formatNumber(REPLY_MAX)} characters`
                                : replyNote(
                                      thread.signsIn,
                                      firstName,
                                      thread.emailedTo,
                                  )}
                        </span>
                        <Button
                            size="sm"
                            disabled={off}
                            onClick={() => void reply()}
                            busy={busy}
                            busyLabel="Sending…"
                        >
                            Send reply
                        </Button>
                    </div>
                </div>
            ) : (
                <ReadOnlyNote className="mt-3.5">
                    Your role can read messages but not answer them.
                </ReadOnlyNote>
            )}
        </>
    );
}
