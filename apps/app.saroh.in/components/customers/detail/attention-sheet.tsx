"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { Textarea } from "@saroh/ui/textarea";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
    addAttentionAction,
    updateAttentionAction,
} from "@/lib/customer-workspace/actions";
import type {
    AttentionDraft,
    AttentionEntry,
    DraftField,
} from "@/lib/customer-workspace/attention";
import {
    DETAIL_MAX,
    draftChanged,
    draftFrom,
    draftProblem,
    draftTag,
    EDITOR_KINDS,
    emptyDraft,
    fieldOf,
    KIND_WORD,
    LABEL_MAX,
    pickKind,
    picksAllergen,
    toInput,
} from "@/lib/customer-workspace/attention";

interface Choice {
    id: string;
    name: string;
}

const CHOICE =
    "h-[34px] rounded-[8px] border px-2.5 text-[12.5px] text-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed coarse:h-11";

/**
 * Add or edit a Needs attention entry (C5), with the controls of the design's
 * booking-page card: the kind, a short label for the team, and the sensitive
 * tick — on for Medical until someone changes it. An allergy is picked from
 * the business's allergen list when it has one, so an order can be checked
 * against it.
 *
 * A save that fails keeps everything typed and says why, on the field when
 * the API names one. Closing with changes asks first.
 */
export function AttentionSheet({
    open,
    onOpenChange,
    contactId,
    entry,
    choices,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contactId: string;
    /** The entry to edit; absent to add one. */
    entry: AttentionEntry | null;
    /** The business's allergens, one per name; empty when it keeps none. */
    choices: Choice[];
}) {
    const router = useRouter();
    const id = useId();
    const [start] = useState(() =>
        entry ? draftFrom(entry, choices) : emptyDraft(),
    );
    const [draft, setDraft] = useState<AttentionDraft>(start);
    const [tried, setTried] = useState(false);
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState<{
        field: DraftField | null;
        message: string;
    } | null>(null);
    const [asking, setAsking] = useState(false);

    const dirty = draftChanged(draft, start);
    const problem = draftProblem(draft, choices);
    const shownProblem = tried ? problem : null;
    const fromList = picksAllergen(draft, choices);
    // A refusal about a field this draft doesn't show (the allergen list
    // couldn't be read, say) is said below the form instead.
    const unplaced =
        failed !== null &&
        (failed.field === null ||
            (failed.field === "allergenId" && !fromList) ||
            (failed.field === "label" && fromList));
    const errorFor = (field: DraftField) =>
        shownProblem?.field === field
            ? shownProblem.message
            : failed?.field === field
              ? failed.message
              : null;

    const change = (next: AttentionDraft) => {
        setDraft(next);
        setFailed(null);
    };

    const close = (force = false) => {
        if (dirty && !force && !saving) {
            setAsking(true);
            return;
        }
        setAsking(false);
        onOpenChange(false);
    };

    async function save() {
        setTried(true);
        if (problem || saving) return;
        setSaving(true);
        setFailed(null);
        const input = toInput(draft, choices);
        const res = await (
            entry
                ? updateAttentionAction(contactId, entry.id, input)
                : addAttentionAction(contactId, input)
        ).catch(() => ({
            ok: false as const,
            error: "The connection dropped before it was saved.",
            field: undefined,
        }));
        setSaving(false);
        if (!res.ok) {
            setFailed({ field: fieldOf(res.field), message: res.error });
            return;
        }
        onOpenChange(false);
        router.refresh();
        const tag = draftTag(draft, choices);
        showSuccess(
            entry ? `${tag} saved.` : `${tag} added to Needs attention.`,
        );
    }

    const labelError = errorFor("label");
    const allergenError = errorFor("allergenId");
    const detailError = errorFor("detail");

    return (
        <Sheet
            open={open}
            // Opened by the page, which remounts it each time (a fresh draft).
            onOpenChange={(o) => (o ? onOpenChange(true) : close())}
        >
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
                <div className="border-b border-border px-[18px] py-3.5">
                    <SheetTitle className="font-display text-[18px] font-semibold">
                        {entry
                            ? "Edit Needs attention"
                            : "Add to Needs attention"}
                    </SheetTitle>
                    <SheetDescription className="mt-1 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        What the team should know before they serve them. It
                        shows by their name on this page and on their bookings.
                    </SheetDescription>
                </div>
                <form
                    id={id}
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                    className="flex flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-4"
                >
                    <div className="grid gap-1.5">
                        <span
                            id={`${id}-kind`}
                            className="text-[12.5px] font-medium"
                        >
                            Kind
                        </span>
                        <div
                            role="radiogroup"
                            aria-labelledby={`${id}-kind`}
                            className="flex flex-wrap gap-1"
                        >
                            {EDITOR_KINDS.map((k) => {
                                const on = draft.kind === k;
                                return (
                                    <button
                                        key={k}
                                        type="button"
                                        role="radio"
                                        aria-checked={on}
                                        disabled={saving}
                                        onClick={() =>
                                            change(pickKind(draft, k))
                                        }
                                        className={cn(
                                            CHOICE,
                                            on
                                                ? "border-foreground bg-muted font-semibold"
                                                : "border-border bg-card font-medium hover:bg-muted",
                                        )}
                                    >
                                        {KIND_WORD[k]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {fromList ? (
                        <div className="grid gap-1.5">
                            <span
                                id={`${id}-allergen`}
                                className="text-[12.5px] font-medium"
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
                            <FieldNote
                                id={`${id}-allergen-error`}
                                error={allergenError}
                            >
                                From your allergen list, so their orders can be
                                checked against it.
                            </FieldNote>
                        </div>
                    ) : (
                        <div className="grid gap-1.5">
                            <Label
                                htmlFor={`${id}-label`}
                                className="text-[12.5px] font-medium"
                            >
                                Short label for the team
                            </Label>
                            <Input
                                id={`${id}-label`}
                                value={draft.label}
                                maxLength={LABEL_MAX}
                                disabled={saving}
                                aria-invalid={labelError ? true : undefined}
                                aria-describedby={`${id}-label-error`}
                                placeholder={
                                    draft.kind === "ALLERGY"
                                        ? "e.g. Sesame"
                                        : draft.kind === "MEDICAL"
                                          ? "e.g. Blood thinners"
                                          : draft.kind === "ACCESS"
                                            ? "e.g. Uses a wheelchair"
                                            : "e.g. Hard of hearing"
                                }
                                onChange={(e) =>
                                    change({ ...draft, label: e.target.value })
                                }
                                className="h-[38px] rounded-[9px] text-[14px]"
                            />
                            <FieldNote
                                id={`${id}-label-error`}
                                error={labelError}
                            >
                                It reads “{KIND_WORD[draft.kind]}:{" "}
                                {draft.label.trim() || "…"}” by their name.
                            </FieldNote>
                        </div>
                    )}

                    <div className="grid gap-1.5">
                        <Label
                            htmlFor={`${id}-detail`}
                            className="text-[12.5px] font-medium"
                        >
                            Detail{" "}
                            <span className="font-normal text-muted-foreground">
                                (optional)
                            </span>
                        </Label>
                        <Textarea
                            id={`${id}-detail`}
                            rows={3}
                            value={draft.detail}
                            disabled={saving}
                            aria-invalid={detailError ? true : undefined}
                            aria-describedby={`${id}-detail-error`}
                            placeholder="e.g. Takes warfarin. Check before any extraction"
                            onChange={(e) =>
                                change({ ...draft, detail: e.target.value })
                            }
                            className="resize-y rounded-[9px] text-[13.5px] leading-[1.5]"
                        />
                        <FieldNote
                            id={`${id}-detail-error`}
                            error={detailError}
                        >
                            {`${draft.detail.trim().length} / ${DETAIL_MAX}`}
                        </FieldNote>
                    </div>

                    <label className="flex cursor-pointer items-start gap-2 text-[12.5px] leading-[1.45] text-foreground/75 coarse:min-h-11">
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
                            className="mt-px"
                        />
                        <span>
                            Sensitive — only people who can edit customers can
                            read it. Everyone else sees that there is a note
                            they can&apos;t read.
                        </span>
                    </label>

                    {failed && unplaced ? (
                        <p
                            role="alert"
                            className="rounded-[9px] bg-destructive-subtle px-3 py-2.5 text-[12.5px] leading-[1.5] text-destructive-subtle-foreground"
                        >
                            {failed.message} Nothing was saved; what you typed
                            is still here.
                        </p>
                    ) : null}
                </form>
                {asking ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center gap-2 border-t border-border bg-brand-subtle px-[18px] py-2.5"
                    >
                        <span className="flex-[1_1_180px] text-[12.5px] text-brand-subtle-foreground">
                            You have changes that are not saved.
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => close(true)}
                            className="h-[30px] rounded-[8px] px-[11px] text-[12px] font-semibold text-destructive-subtle-foreground coarse:h-11"
                        >
                            Discard
                        </Button>
                        <Button
                            type="button"
                            onClick={() => setAsking(false)}
                            className="h-[30px] rounded-[8px] px-[11px] text-[12px] font-semibold coarse:h-11"
                        >
                            Keep editing
                        </Button>
                    </div>
                ) : null}
                <div className="flex items-center gap-2 border-t border-border px-[18px] py-3">
                    <span className="flex-1 text-[12px] text-muted-foreground">
                        {entry && !dirty ? "No changes yet" : ""}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => close()}
                        className="h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form={id}
                        disabled={saving || (entry !== null && !dirty)}
                        className="h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
                    >
                        {saving
                            ? "Saving…"
                            : entry
                              ? "Save"
                              : "Add to Needs attention"}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

/** A field's quiet note, or its error in its place. */
function FieldNote({
    id,
    error,
    children,
}: {
    id: string;
    error: string | null;
    children: React.ReactNode;
}) {
    return (
        <span
            id={id}
            role={error ? "alert" : undefined}
            className={cn(
                "text-[11.5px]",
                error
                    ? "text-destructive-subtle-foreground"
                    : "text-muted-foreground",
            )}
        >
            {error ?? children}
        </span>
    );
}
