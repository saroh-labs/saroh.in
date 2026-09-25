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
 * Notes the team keeps about a customer — never shown to them. An allergy is
 * picked from the storefront's allergen list, not typed, so Order Detail's
 * banner matches the products exactly. Deleting one of your own has Undo.
 */
export function Notes({
    contactId,
    rows,
    choices,
    canWrite,
    userId,
    timeZone,
    now,
}: {
    contactId: string;
    rows: DetailNote[];
    choices: { id: string; name: string }[];
    canWrite: boolean;
    userId: string | null;
    timeZone: string;
    now: Date;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [gone, setGone] = useState<string[]>([]);
    const ids = { text: useId(), allergy: useId() };
    const text = draft.trim();
    const off = busy || (!text && !picked.length) || text.length > MAX;

    async function add() {
        if (off) return;
        setBusy(true);
        const res = await addNoteAction(contactId, {
            body: text,
            allergenIds: picked,
        });
        setBusy(false);
        if (!res.ok) return showError(res.error);
        setDraft("");
        setPicked([]);
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
            void addNoteAction(contactId, {
                body: n.body,
                allergenIds: n.allergens.map((a) => a.id),
            }).then((back) => {
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
                can read them{canWrite ? "" : "; owners and admins add them"}.
            </p>
            {canWrite ? (
                <div className="mb-3 rounded-xl border border-border bg-card px-3.5 py-3">
                    <label htmlFor={ids.text} className="sr-only">
                        New note
                    </label>
                    <textarea
                        id={ids.text}
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="e.g. Allergic to sesame — check the bun tray"
                        className="block w-full resize-y rounded-[8px] border border-border bg-card px-2.5 py-2 text-[13px] leading-[1.5] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {choices.length ? (
                        <div
                            role="group"
                            aria-labelledby={ids.allergy}
                            className="mt-2 flex flex-wrap items-center gap-1.5"
                        >
                            <span
                                id={ids.allergy}
                                className="mr-0.5 text-[11.5px] text-muted-foreground"
                            >
                                Allergy
                            </span>
                            {choices.map((a) => {
                                const on = picked.includes(a.id);
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() =>
                                            setPicked((p) =>
                                                on
                                                    ? p.filter(
                                                          (x) => x !== a.id,
                                                      )
                                                    : [...p, a.id],
                                            )
                                        }
                                        className={cn(
                                            "h-7 rounded-full border px-2.5 text-[12px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11",
                                            on
                                                ? "border-destructive-subtle-foreground bg-destructive-subtle font-semibold text-destructive-subtle-foreground"
                                                : "border-border bg-card text-foreground/75 hover:bg-muted",
                                        )}
                                    >
                                        {a.name}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
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
                    Useful for things the team should remember — an allergy, a
                    usual order, how they like to be called.
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
                        {n.allergens.length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {n.allergens.map((a) => (
                                    <span
                                        key={a.id}
                                        className="rounded-full bg-destructive-subtle px-2 py-0.5 text-[11.5px] font-semibold text-destructive-subtle-foreground"
                                    >
                                        Allergy: {a.name}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {n.body ? (
                            <div className="mt-1 whitespace-pre-line text-[13.5px] leading-[1.55] text-foreground/75">
                                {n.body}
                            </div>
                        ) : null}
                    </article>
                ))}
            </div>
        </>
    );
}
