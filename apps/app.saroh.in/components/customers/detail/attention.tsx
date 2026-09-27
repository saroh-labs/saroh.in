"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { ToastId } from "@saroh/ui/toast";
import { dismissToast, showError, showUndo } from "@saroh/ui/toast";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
    AttentionTag,
    AttentionTags,
} from "@/components/customers/attention-tags";
import { removeAttentionAction } from "@/lib/customer-workspace/actions";
import type {
    AttentionEntry,
    DetailAttention,
} from "@/lib/customer-workspace/attention";
import {
    entryMeta,
    hiddenText,
    tagText,
    tagTitle,
} from "@/lib/customer-workspace/attention";
import type { HoldSlot } from "@/lib/hold-undo";
import { createHoldSlot, HOLD_UNDO_MS } from "@/lib/hold-undo";

import { AttentionSheet } from "./attention-sheet";
import { CARD, LABEL } from "./parts";

/**
 * Needs attention on Customer Detail (DEC-040, C5): the tags by the name, a
 * card on Overview that lists each entry with its detail, and the sheet that
 * adds and edits them. A role without `contact:write` reads, and is told so.
 *
 * Removing one takes it off the page at once and sends nothing for ten
 * seconds (`lib/hold-undo.ts`): Undo puts it back, and only when the window
 * closes — or the page is left — is it taken off the record.
 */
export function useAttention({
    contactId,
    attention,
}: {
    contactId: string;
    attention: DetailAttention | null | undefined;
}) {
    const router = useRouter();
    const [gone, setGone] = useState<string[]>([]);
    const [sheet, setSheet] = useState<{
        key: number;
        entry: AttentionEntry | null;
    } | null>(null);
    const slotRef = useRef<HoldSlot | null>(null);

    // Leaving the page: what was taken off without Undo is taken off.
    useEffect(() => () => void slotRef.current?.leave(), []);

    const entries = (attention?.entries ?? []).filter(
        (e) => !gone.includes(e.id),
    );

    function remove(entry: AttentionEntry) {
        setGone((g) => [...g, entry.id]);
        const back = () => setGone((g) => g.filter((x) => x !== entry.id));
        let refused: string | null = null;
        let toastId: ToastId | null = null;
        const slot = (slotRef.current ??= createHoldSlot());
        const held = slot.start({
            commit: async () => {
                const res = await removeAttentionAction(contactId, entry.id);
                if (!res.ok) {
                    refused = res.error;
                    throw new Error(res.error);
                }
            },
            undo: back,
            onChange: (state) => {
                if (state.status === "held") return;
                if (toastId !== null) dismissToast(toastId);
                if (state.status === "committed") router.refresh();
                if (state.status === "failed") {
                    back();
                    showError(
                        refused ?? "Could not take that off Needs attention.",
                        `${tagText(entry)} is still on their list.`,
                    );
                }
            },
        });
        toastId = showUndo(
            `${tagText(entry)} taken off Needs attention.`,
            () => void held.undo(),
            { duration: HOLD_UNDO_MS },
        );
    }

    return {
        entries,
        hiddenCount: attention?.hiddenSensitiveCount ?? 0,
        read: attention !== null && attention !== undefined,
        remove,
        add: () => setSheet({ key: Date.now(), entry: null }),
        edit: (entry: AttentionEntry) => setSheet({ key: Date.now(), entry }),
        sheet,
        closeSheet: () => setSheet(null),
    };
}

export type AttentionState = ReturnType<typeof useAttention>;

/** The tags by the name: each entry this viewer may see, then the hidden count. */
export function HeaderAttention({ state }: { state: AttentionState }) {
    return (
        <AttentionTags
            size="header"
            tags={state.entries.map((e) => ({
                id: e.id,
                kind: e.kind,
                label: e.label,
                title: tagTitle(e),
            }))}
            hiddenCount={state.hiddenCount}
        />
    );
}

const TEXT_BTN =
    "text-[12px] text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed coarse:min-h-11";

/**
 * Overview's Needs attention card: each entry with its detail and who added
 * it, Edit and Remove for a role that may, and what this role can't see.
 */
export function AttentionCard({
    state,
    canWrite,
    userId,
    timeZone,
    now,
}: {
    state: AttentionState;
    canWrite: boolean;
    userId: string | null;
    timeZone: string;
    now: Date;
}) {
    const hidden = hiddenText(state.hiddenCount, state.entries.length);
    return (
        <section className={CARD} aria-label="Needs attention">
            <div className="flex items-baseline gap-2">
                <span className={cn(LABEL, "flex-1")}>Needs attention</span>
                {canWrite && state.read ? (
                    <button
                        type="button"
                        onClick={state.add}
                        className="text-[12.5px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                    >
                        Add
                    </button>
                ) : null}
            </div>
            {!state.read ? (
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Needs attention couldn&apos;t be read just now. Nothing on
                    it has changed.
                </p>
            ) : (
                <>
                    {state.entries.map((e) => (
                        <div
                            key={e.id}
                            className="mt-2.5 border-t border-foreground/10 pt-2.5"
                        >
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <AttentionTag tag={e} size="header" />
                                {e.sensitive ? (
                                    <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                                        <Lock
                                            aria-hidden
                                            className="size-3 shrink-0"
                                        />
                                        Sensitive
                                    </span>
                                ) : null}
                                <span className="flex-1" />
                                {canWrite ? (
                                    <span className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => state.edit(e)}
                                            aria-label={`Edit ${tagText(e)}`}
                                            className={TEXT_BTN}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => state.remove(e)}
                                            aria-label={`Remove ${tagText(e)}`}
                                            className={cn(
                                                TEXT_BTN,
                                                "hover:text-destructive-subtle-foreground",
                                            )}
                                        >
                                            Remove
                                        </button>
                                    </span>
                                ) : null}
                            </div>
                            {e.detail ? (
                                <p className="mt-1.5 whitespace-pre-line text-pretty text-[13.5px] leading-[1.5] text-foreground/75">
                                    {e.detail}
                                </p>
                            ) : null}
                            <p className="mt-1 text-[12px] text-muted-foreground">
                                {entryMeta(e, userId, timeZone, now)}
                            </p>
                        </div>
                    ))}
                    {!state.entries.length && !hidden ? (
                        <p className="mt-1.5 text-pretty text-[13px] leading-[1.5] text-muted-foreground">
                            Nothing yet. An allergy, a medical note or an access
                            need goes here, and the team sees it by their name
                            and on their bookings.
                        </p>
                    ) : null}
                    {hidden ? (
                        <p
                            className={cn(
                                "flex items-center gap-1.5 text-[12.5px] text-muted-foreground",
                                state.entries.length
                                    ? "mt-2.5 border-t border-foreground/10 pt-2.5"
                                    : "mt-1.5",
                            )}
                        >
                            <Lock
                                aria-hidden
                                className="size-[13px] shrink-0"
                            />
                            {hidden}. Only people who can edit customers can
                            read {state.hiddenCount === 1 ? "it" : "them"}.
                        </p>
                    ) : null}
                    {!canWrite ? (
                        <p className="mt-2.5 text-[11.5px] text-muted-foreground">
                            Your role can read this but not change their record.
                        </p>
                    ) : null}
                </>
            )}
        </section>
    );
}

/** The add/edit sheet, remounted for each opening. */
export function AttentionEditor({
    state,
    contactId,
    choices,
}: {
    state: AttentionState;
    contactId: string;
    choices: { id: string; name: string }[];
}) {
    if (!state.sheet) return null;
    return (
        <AttentionSheet
            key={state.sheet.key}
            open
            onOpenChange={(o) => (o ? null : state.closeSheet())}
            contactId={contactId}
            entry={state.sheet.entry}
            choices={choices}
        />
    );
}
