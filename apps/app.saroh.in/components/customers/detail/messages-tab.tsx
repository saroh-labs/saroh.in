"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { clock } from "@/lib/calendar/layers";
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
import { dayText } from "@/lib/subscriptions/view";

import { Empty } from "./parts";

/**
 * Messages on Customer Detail (round-2 A13): the customer's one thread with
 * the business — what they wrote from their account on the business's
 * site, the team's answers, and invoices sent into it — and a reply box for
 * whoever may answer (`message:write`).
 *
 * Opening the tab marks the customer's messages read, so its count clears.
 * A reply shows in their account on the site; nothing is emailed or texted
 * (ADR-011), and the line under the box says so.
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
            error: "The connection dropped. Your reply wasn't sent.",
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
                <Empty>{emptyThreadText(thread.signsIn, firstName)}</Empty>
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
                                    {dayText(m.at, timeZone, now)},{" "}
                                    {clock(m.at, timeZone)}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            {thread.canReply ? (
                <div className="mt-3.5 rounded-xl border border-border bg-card px-3.5 py-3">
                    <label htmlFor={`${id}-reply`} className="sr-only">
                        Reply to {firstName}
                    </label>
                    <textarea
                        id={`${id}-reply`}
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                void reply();
                            }
                        }}
                        aria-describedby={`${id}-note`}
                        placeholder={`Reply to ${firstName}…`}
                        className="block w-full resize-y rounded-[8px] border border-border bg-card px-2.5 py-2 text-[13px] leading-[1.5] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="mt-2 flex items-center gap-2">
                        <span
                            id={`${id}-note`}
                            className={cn(
                                "flex-1 text-pretty text-[11.5px]",
                                over
                                    ? "text-destructive-subtle-foreground"
                                    : "text-muted-foreground",
                            )}
                        >
                            {over
                                ? `Over ${REPLY_MAX.toLocaleString("en-IN")} characters`
                                : replyNote(thread.signsIn, firstName)}
                        </span>
                        <Button
                            size="sm"
                            disabled={off}
                            onClick={() => void reply()}
                            className="h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
                        >
                            {busy ? "Sending…" : "Send reply"}
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
