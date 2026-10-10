"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Sheet, SheetTrigger } from "@saroh/ui/sheet";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
    ACTION_SHEET_BODY,
    ACTION_SHEET_FORM,
    ActionSheetContent,
    ActionSheetFooter,
} from "@/components/shared/action-sheet";
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

/** The page's small button, as the tab's other actions are drawn. */
const SMALL = "h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11";

/**
 * Notes the team keeps about a customer — never shown to them. Text only
 * (Z2a): an allergy goes on Needs attention, which Order Detail's banner
 * checks the products against. Deleting one of your own has Undo.
 *
 * Read first (owner, 10 Oct): the tab is the list, and one "Add note"
 * button opens a side sheet with the field. A sheet, not a small dialog,
 * though the form is one field: it is what Edit details and Needs attention
 * open on this page, and adding is the same gesture everywhere. With no
 * notes the button sits in the empty state instead of above it.
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
    const [open, setOpen] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [gone, setGone] = useState<string[]>([]);
    const addRef = useRef<HTMLButtonElement>(null);
    const shown = rows.filter((n) => !gone.includes(n.id));
    const empty = shown.length === 0;

    // The first note replaces the empty state, and with it the button the
    // sheet gave the keyboard back to: hand it on to the one above the list.
    const wasEmpty = useRef(empty);
    useEffect(() => {
        if (
            wasEmpty.current &&
            !empty &&
            document.activeElement === document.body
        ) {
            addRef.current?.focus();
        }
        wasEmpty.current = empty;
    }, [empty]);

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

    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                setDirty(false);
            }}
        >
            <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="min-w-0 flex-[1_1_240px] text-[12.5px] text-muted-foreground">
                    Team only. Never shown to the customer.{" "}
                    {canWrite
                        ? "Everyone on the team can read and add notes."
                        : "Everyone on the team can read them. Your role can't add them."}
                </p>
                {canWrite && !empty ? (
                    <SheetTrigger asChild>
                        <Button ref={addRef} size="sm" className={SMALL}>
                            Add note
                        </Button>
                    </SheetTrigger>
                ) : null}
            </div>
            {canWrite ? null : (
                <ReadOnlyNote>
                    Your role can read these notes but not add them.
                </ReadOnlyNote>
            )}
            {empty ? (
                <Empty title="No notes yet">
                    Useful for things the team should remember: a usual order,
                    how they like to be called. An allergy goes on Needs
                    attention, where orders are checked against it.
                    {canWrite ? (
                        <div className="mt-3.5">
                            <SheetTrigger asChild>
                                <Button size="sm" className={SMALL}>
                                    Add note
                                </Button>
                            </SheetTrigger>
                        </div>
                    ) : null}
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
                                    className="text-[12px] text-muted-foreground hover:text-destructive-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-destructive-subtle coarse:min-h-11"
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
            <ActionSheetContent
                title="Add note"
                description="Team only. Never shown to the customer. An allergy goes on Needs attention, where orders are checked against it."
                dirty={dirty}
            >
                <NoteForm
                    contactId={contactId}
                    onDone={() => {
                        setOpen(false);
                        setDirty(false);
                    }}
                    onDirtyChange={setDirty}
                />
            </ActionSheetContent>
        </Sheet>
    );
}

/**
 * The sheet's one field. A refusal is a toast and the sheet stays open with
 * what was typed; a saved note closes it and shows at the top of the list.
 */
function NoteForm({
    contactId,
    onDone,
    onDirtyChange,
}: {
    contactId: string;
    onDone: () => void;
    onDirtyChange: (dirty: boolean) => void;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const textId = useId();
    const text = draft.trim();
    const over = text.length > MAX;
    const off = busy || !text || over;

    async function add(e: React.FormEvent) {
        e.preventDefault();
        if (off) return;
        setBusy(true);
        const res = await addNoteAction(contactId, { body: text });
        setBusy(false);
        if (!res.ok) return showError(res.error);
        onDone();
        router.refresh();
    }

    return (
        <form onSubmit={(e) => void add(e)} className={ACTION_SHEET_FORM}>
            <div className={ACTION_SHEET_BODY}>
                <div className="grid gap-2">
                    <Label htmlFor={textId}>Note</Label>
                    <Textarea
                        id={textId}
                        rows={5}
                        value={draft}
                        disabled={busy}
                        aria-invalid={over}
                        aria-describedby={`${textId}-count`}
                        onChange={(e) => {
                            setDraft(e.target.value);
                            onDirtyChange(e.target.value.trim() !== "");
                        }}
                        placeholder="e.g. Collects on Saturdays before 8"
                    />
                    <span
                        id={`${textId}-count`}
                        className={cn(
                            "text-[12px]",
                            over
                                ? "text-destructive-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {over
                            ? `Over ${MAX} characters`
                            : `${text.length} / ${MAX}`}
                    </span>
                </div>
            </div>
            <ActionSheetFooter busy={busy}>
                <Button type="submit" disabled={off}>
                    {busy ? "Adding…" : "Add note"}
                </Button>
            </ActionSheetFooter>
        </form>
    );
}
