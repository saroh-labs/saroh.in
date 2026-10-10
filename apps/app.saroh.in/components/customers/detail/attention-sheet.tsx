"use client";

import { FormSheet } from "@/components/shared/form-sheet";
import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
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
    NO_SENSITIVE_NOTE,
    pickKind,
    picksAllergen,
    toInput,
} from "@/lib/customer-workspace/attention";
import { Notice } from "@saroh/ui/notice";

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
 * the API names one. It is the app's one sheet frame (`FormSheet`): a
 * press outside does nothing once something is typed, and Cancel, Escape
 * and the close button drop it.
 */
export function AttentionSheet({
    open,
    onOpenChange,
    contactId,
    entry,
    choices,
    canSensitive = true,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contactId: string;
    /** The entry to edit; absent to add one. */
    entry: AttentionEntry | null;
    /** The business's allergens, one per name; empty when it keeps none. */
    choices: Choice[];
    /** `customer:sensitive`: may mark a note sensitive (C13). */
    canSensitive?: boolean;
}) {
    const router = useRouter();
    const id = useId();
    const [start] = useState(() =>
        entry ? draftFrom(entry, choices) : emptyDraft(canSensitive),
    );
    const [draft, setDraft] = useState<AttentionDraft>(start);
    const [tried, setTried] = useState(false);
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState<{
        field: DraftField | null;
        message: string;
    } | null>(null);

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
        <FormSheet
            // Opened by the page, which remounts it each time (a fresh draft).
            id={id}
            open={open}
            title={entry ? "Edit Needs attention" : "Add to Needs attention"}
            description="What the team should know before they serve them. It shows by their name on this page and on their bookings."
            pending={saving}
            dirty={dirty}
            saveLabel={entry ? "Save" : "Add to Needs attention"}
            savingLabel={entry ? "Saving…" : "Adding…"}
            fieldsClassName="gap-4"
            onClose={() => onOpenChange(false)}
            onSubmit={save}
        >
            <div className="grid gap-1.5">
                <span id={`${id}-kind`} className="text-[12.5px] font-medium">
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
                            allergenError ? `${id}-allergen-error` : undefined
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
                                            : "border-border bg-card text-foreground/75 hover:bg-muted active:bg-accent-active",
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
                        From your allergen list, so their orders can be checked
                        against it.
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
                    <FieldNote id={`${id}-label-error`} error={labelError}>
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
                <FieldNote id={`${id}-detail-error`} error={detailError}>
                    {`${draft.detail.trim().length} / ${DETAIL_MAX}`}
                </FieldNote>
            </div>

            {canSensitive ? (
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
                        Sensitive. Only people who can see sensitive notes can
                        read it. Everyone else sees that there is a note they
                        can&apos;t read.
                    </span>
                </label>
            ) : (
                <p className="text-[12.5px] leading-[1.45] text-muted-foreground">
                    {NO_SENSITIVE_NOTE}
                </p>
            )}

            {failed && unplaced ? (
                <Notice tone="error">
                    {failed.message} Nothing was saved. What you typed is still
                    here.
                </Notice>
            ) : null}
        </FormSheet>
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
