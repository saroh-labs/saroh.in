"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import {
    addNoteAction,
    deleteNoteAction,
} from "@/lib/customer-workspace/actions";
import type { DetailNote } from "@/lib/customer-workspace/detail";
import { dayText } from "@/lib/subscriptions/view";

import { Empty } from "./parts";

/** The design's limit: a note is a line or two, not a document. */
const MAX = 500;

/**
 * Notes the team keeps about a customer — never shown to them. Text only
 * (Z2a): an allergy goes on Needs attention, which Order Detail's banner
 * checks the products against. Deleting one of your own has Undo.
 */
export function Notes({
    contactId,
    rows,
    canWrite,
    userId,
    timeZone,
    now,
}: {
    contactId: string;
    rows: DetailNote[];
    canWrite: boolean;
    userId: string | null;
    timeZone: string;
    now: Date;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [gone, setGone] = useState<string[]>([]);
    const textId = useId();
    const text = draft.trim();
    const off = busy || !text || text.length > MAX;

    async function add() {
        if (off) return;
        setBusy(true);
        const res = await addNoteAction(contactId, { body: text });
        setBusy(false);
        if (!res.ok) return showError(res.error);
        setDraft("");
        router.refresh();
    }

    async function remove(n: DetailNote) {
        setGone((g) => [...g, n.id]);
        const res = await deleteNoteAction(contactId, n.id);
        if (!res.ok) {
            setGone((g) => g.filter((x) => x !== n.id));
            return showError(res.error);
        }
        router.refresh();
        showUndo("Note deleted.", () => {
            void addNoteAction(contactId, { body: n.body }).then((back) => {
                if (!back.ok) showError(back.error);
                router.refresh();
            });
        });
    }

    const shown = rows.filter((n) => !gone.includes(n.id));
    return (
        <>
            <p className="mb-2.5 text-[12.5px] text-muted-foreground">
                Team only — never shown to the customer. Everyone on the team
                can read them{canWrite ? "" : ". Your role can't add them"}.
            </p>
            {canWrite ? (
                <div className="mb-3 rounded-xl border border-border bg-card px-3.5 py-3">
                    <label htmlFor={textId} className="sr-only">
                        New note
                    </label>
                    <textarea
                        id={textId}
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="e.g. Collects on Saturdays before 8"
                        className="block w-full resize-y rounded-[8px] border border-border bg-card px-2.5 py-2 text-[13px] leading-[1.5] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="mt-2 flex items-center gap-2">
                        <span
                            className={cn(
                                "flex-1 text-[11.5px]",
                                text.length > MAX
                                    ? "text-destructive-subtle-foreground"
                                    : "text-muted-foreground",
                            )}
                        >
                            {text.length > MAX
                                ? `Over ${MAX} characters`
                                : `${text.length} / ${MAX}`}
                        </span>
                        <Button
                            size="sm"
                            disabled={off}
                            onClick={() => void add()}
                            className="h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
                        >
                            {busy ? "Adding…" : "Add note"}
                        </Button>
                    </div>
                </div>
            ) : (
                <ReadOnlyNote>
                    Your role can read these notes but not add them.
                </ReadOnlyNote>
            )}
            {!shown.length ? (
                <Empty title="No notes yet">
                    Useful for things the team should remember — a usual order,
                    how they like to be called. An allergy goes on Needs
                    attention, where orders are checked against it.
                </Empty>
            ) : null}
            <div className="flex flex-col gap-2">
                {shown.map((n) => (
                    <article
                        key={n.id}
                        aria-label={`Note from ${dayText(n.createdAt, timeZone, now)}`}
                        className="rounded-xl border border-border bg-card px-3.5 py-[11px]"
                    >
                        <div className="flex items-baseline gap-2">
                            <span className="text-[12.5px] font-semibold">
                                {n.createdByUserId &&
                                n.createdByUserId === userId
                                    ? "You"
                                    : (n.author?.split(" ")[0] ?? "Team")}
                            </span>
                            <span className="flex-1 text-[12px] text-muted-foreground">
                                {dayText(n.createdAt, timeZone, now)}
                            </span>
                            {canWrite && n.createdByUserId === userId ? (
                                <button
                                    type="button"
                                    onClick={() => void remove(n)}
                                    className="text-[12px] text-muted-foreground hover:text-destructive-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                                >
                                    Delete
                                </button>
                            ) : null}
                        </div>
                        <div className="mt-1 whitespace-pre-line text-[13.5px] leading-[1.55] text-foreground/75">
                            {n.body}
                        </div>
                    </article>
                ))}
            </div>
        </>
    );
}
