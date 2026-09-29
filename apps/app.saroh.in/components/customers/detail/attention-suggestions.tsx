"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import type { ToastId } from "@saroh/ui/toast";
import {
    dismissToast,
    showError,
    showSuccess,
    showUndo,
} from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
    confirmAttentionAction,
    removeAttentionAction,
} from "@/lib/customer-workspace/actions";
import type {
    AttentionDraft,
    AttentionEntry,
    DraftField,
} from "@/lib/customer-workspace/attention";
import {
    draftProblem,
    draftTag,
    fieldOf,
    KIND_WORD,
    NO_SENSITIVE_NOTE,
    pickKind,
    picksAllergen,
    setAsideText,
    SUGGESTION_KINDS,
    SUGGESTION_LABEL_MAX,
    suggestionDraft,
    suggestionsTitle,
    suggestionWhen,
    toSuggestionInput,
} from "@/lib/customer-workspace/attention";
import type { HoldSlot } from "@/lib/hold-undo";
import { createHoldSlot, HOLD_UNDO_MS } from "@/lib/hold-undo";

interface Choice {
    id: string;
    name: string;
}

const CHOICE =
    "h-[34px] cursor-pointer rounded-[8px] border px-2.5 text-[12.5px] text-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted disabled:cursor-not-allowed disabled:opacity-60 coarse:h-11";

/**
 * Notes from the customer (C12, "Saroh Customer Detail" › patient notes):
 * what a booker wrote in "Anything we should know?", or a health note they
 * sent from their account on the site (A5, source CUSTOMER), waiting above
 * the tabs for someone to check it with them. Each says where it came from. Add puts it on Needs attention with the
 * label, kind and sensitive tick chosen here; "Nothing to add" sets it aside
 * — the note stays on the booking either way.
 *
 * The API sends these only to someone who can add them, and a sensitive
 * one only to someone who may read it, so this draws whatever it is given
 * and hides nothing. Without `customer:sensitive` the sensitive tick isn't
 * offered: the API would refuse it.
 * "Nothing to add" waits ten seconds before it is sent (`lib/hold-undo.ts`),
 * so it can be undone.
 */
export function AttentionSuggestions({
    contactId,
    suggestions,
    choices,
    firstName,
    timeZone,
    now,
    canSensitive = true,
}: {
    contactId: string;
    suggestions: AttentionEntry[];
    /** The business's allergens, one per name; empty when it keeps none. */
    choices: Choice[];
    firstName: string | null;
    timeZone: string;
    now: Date;
    /** `customer:sensitive`: may mark a note sensitive (C13). */
    canSensitive?: boolean;
}) {
    const router = useRouter();
    const [gone, setGone] = useState<string[]>([]);
    const slotRef = useRef<HoldSlot | null>(null);

    // Leaving the page: what was set aside without Undo is sent.
    useEffect(() => () => void slotRef.current?.leave(), []);

    const shown = suggestions.filter((s) => !gone.includes(s.id));
    if (!shown.length) return null;

    function setAside(entry: AttentionEntry) {
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
                        refused ?? "Could not set that note aside.",
                        "It is still waiting above their record.",
                    );
                }
            },
        });
        toastId = showUndo(setAsideText(entry), () => void held.undo(), {
            duration: HOLD_UNDO_MS,
        });
    }

    return (
        <section
            aria-label={suggestionsTitle(shown)}
            className="mb-3.5 grid gap-3 rounded-xl border border-highlight bg-brand-subtle px-4 py-3.5"
        >
            <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13.5px] font-semibold text-brand-subtle-foreground">
                    {suggestionsTitle(shown)}
                </span>
                <span className="text-pretty text-[12px] text-muted-foreground">
                    Check it with them, then add it to Needs attention so the
                    team sees it on every booking.
                </span>
            </div>
            {shown.map((s) => (
                <SuggestionCard
                    key={s.id}
                    contactId={contactId}
                    entry={s}
                    choices={choices}
                    when={suggestionWhen(firstName, s, timeZone, now)}
                    onSetAside={() => setAside(s)}
                    canSensitive={canSensitive}
                />
            ))}
        </section>
    );
}

/** One note: its words, and the choices it goes on the record with. */
function SuggestionCard({
    contactId,
    entry,
    choices,
    when,
    onSetAside,
    canSensitive,
}: {
    contactId: string;
    entry: AttentionEntry;
    choices: Choice[];
    when: string;
    onSetAside: () => void;
    canSensitive: boolean;
}) {
    const router = useRouter();
    const id = useId();
    const [draft, setDraft] = useState<AttentionDraft>(() =>
        suggestionDraft(entry, choices),
    );
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState<{
        field: DraftField | null;
        message: string;
    } | null>(null);

    const fromList = picksAllergen(draft, choices);
    const problem = draftProblem(draft, choices);
    const errorFor = (field: DraftField) =>
        failed?.field === field ? failed.message : null;
    const labelError = errorFor("label");
    const allergenError = errorFor("allergenId");
    // A refusal about something the card doesn't show is said below it.
    const unplaced =
        failed !== null && !labelError && !(fromList && allergenError);

    const change = (next: AttentionDraft) => {
        setDraft(next);
        setFailed(null);
    };

    async function add() {
        if (problem || saving) return;
        setSaving(true);
        setFailed(null);
        const res = await confirmAttentionAction(
            contactId,
            entry.id,
            toSuggestionInput(draft, choices),
        ).catch(() => ({
            ok: false as const,
            error: "The connection dropped before it was added.",
            field: undefined,
        }));
        setSaving(false);
        if (!res.ok) {
            setFailed({ field: fieldOf(res.field), message: res.error });
            return;
        }
        router.refresh();
        showSuccess(`${draftTag(draft, choices)} added to Needs attention.`);
    }

    // The words are the booker's own, so the whole note is shown: the
    // detail holds it (cut at 500 characters for a longer note).
    const words = entry.detail?.trim() ? entry.detail : entry.label;

    return (
        <div className="grid gap-2.5 rounded-[10px] border border-border bg-card px-3.5 py-3">
            <div className="text-[12px] text-muted-foreground">{when}</div>
            <p className="whitespace-pre-line text-pretty text-[14px] leading-[1.5] text-foreground">
                &ldquo;{words}&rdquo;
            </p>
            <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                {fromList ? (
                    <div className="grid min-w-0 gap-[5px]">
                        <span
                            id={`${id}-allergen`}
                            className="text-[12px] font-medium"
                        >
                            What they&apos;re allergic to
                        </span>
                        <div
                            role="radiogroup"
                            aria-labelledby={`${id}-allergen`}
                            aria-describedby={
                                allergenError
                                    ? `${id}-allergen-error`
                                    : undefined
                            }
                            className="flex flex-wrap gap-1.5"
                        >
                            {choices.map((a) => {
                                const on = draft.allergenId === a.id;
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={on}
                                        disabled={saving}
                                        onClick={() =>
                                            change({
                                                ...draft,
                                                allergenId: a.id,
                                            })
                                        }
                                        className={cn(
                                            "h-7 cursor-pointer rounded-full border px-2.5 text-[12px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted disabled:cursor-not-allowed coarse:h-11",
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
                    </div>
                ) : (
                    <div className="grid min-w-0 gap-[5px]">
                        <Label
                            htmlFor={`${id}-label`}
                            className="text-[12px] font-medium"
                        >
                            Short label for the team
                        </Label>
                        <Input
                            id={`${id}-label`}
                            value={draft.label}
                            maxLength={SUGGESTION_LABEL_MAX}
                            disabled={saving}
                            aria-invalid={labelError ? true : undefined}
                            aria-describedby={
                                labelError ? `${id}-label-error` : undefined
                            }
                            onChange={(e) =>
                                change({ ...draft, label: e.target.value })
                            }
                            className="h-[34px] min-w-0 rounded-[8px] px-2.5 text-[13px]"
                        />
                    </div>
                )}
                <div
                    role="radiogroup"
                    aria-label="Kind"
                    className="flex flex-wrap gap-1"
                >
                    {SUGGESTION_KINDS.map((k) => {
                        const on = draft.kind === k;
                        return (
                            <button
                                key={k}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                disabled={saving}
                                onClick={() =>
                                    change(pickKind(draft, k, canSensitive))
                                }
                                className={cn(
                                    CHOICE,
                                    on
                                        ? "border-foreground bg-muted font-semibold"
                                        : "border-border bg-card font-medium hover:bg-muted active:bg-accent-active",
                                )}
                            >
                                {KIND_WORD[k]}
                            </button>
                        );
                    })}
                </div>
            </div>
            {labelError || allergenError ? (
                <span
                    id={
                        labelError
                            ? `${id}-label-error`
                            : `${id}-allergen-error`
                    }
                    role="alert"
                    className="-mt-1 text-[11.5px] text-destructive-subtle-foreground"
                >
                    {labelError ?? allergenError}
                </span>
            ) : null}
            {canSensitive ? (
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground/75 coarse:min-h-11">
                    <Checkbox
                        checked={draft.sensitive}
                        disabled={saving}
                        onCheckedChange={(v) =>
                            change({
                                ...draft,
                                sensitive: v === true,
                                sensitiveSet: true,
                            })
                        }
                    />
                    Sensitive — only people who can see sensitive notes can read
                    it
                </label>
            ) : (
                <p className="text-[12.5px] text-muted-foreground">
                    {NO_SENSITIVE_NOTE}
                </p>
            )}
            {unplaced ? (
                <p
                    role="alert"
                    className="rounded-[9px] bg-destructive-subtle px-3 py-2.5 text-[12.5px] leading-[1.5] text-destructive-subtle-foreground"
                >
                    {failed.message} Nothing was added; your choices are still
                    here.
                </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    onClick={() => void add()}
                    disabled={saving || problem !== null}
                    className="h-[34px] rounded-[8px] px-3.5 text-[12.5px] font-semibold coarse:h-11"
                >
                    {saving ? "Adding…" : "Add to Needs attention"}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onSetAside}
                    disabled={saving}
                    className="h-[34px] rounded-[8px] px-3 text-[12.5px] font-semibold text-foreground/75 coarse:h-11"
                >
                    Nothing to add
                </Button>
            </div>
        </div>
    );
}
