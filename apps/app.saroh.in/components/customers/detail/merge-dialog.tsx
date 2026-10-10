"use client";

import { FormSheet } from "@/components/shared/form-sheet";
import { Button } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { personHref } from "@/lib/contacts/person-href";
import {
    mergeAction,
    mergePreviewAction,
} from "@/lib/customer-workspace/actions";
import type {
    MergeColumn,
    MergePicks,
    MergePreviews,
    MergeRow,
    MergeTarget,
} from "@/lib/customer-workspace/merge";
import {
    accountView,
    columnHeading,
    columnName,
    consentLines,
    defaultPicks,
    mergeBlock,
    mergeBody,
    mergedToast,
    mergeRows,
    mergeSubtitle,
    movesLine,
    pickable,
} from "@/lib/customer-workspace/merge";

import { Notice } from "@saroh/ui/notice";
import { AccountBox, Choice } from "./merge-parts";
import { MergeSearch } from "./merge-search";

interface Loaded {
    previews: MergePreviews;
    keep: MergeColumn;
    picks: MergePicks;
}

const COLUMNS: readonly MergeColumn[] = ["here", "there"];

/**
 * "Merge with a duplicate" (DEC-042, C10), in a wide side sheet: this
 * record and the other side by side, a pick per row
 * for the name, email and phone, and Merge. Around the design's rows it
 * says what the plan asks of a merge before it happens: which record stays
 * (the older one offered, default 22), what moves, offers per channel, the
 * site account that will see the combined record — with the tick Merge
 * waits for (ADR-011) — and anything that refuses it. Final: there is no
 * Undo, and it says so.
 *
 * Opened on a record the page already knows (a suggestion, or the edit
 * sheet's email clash), or with none, when it first searches for one.
 */
export function MergeDialog({
    hereId,
    target,
    open,
    onOpenChange,
    survivorHref = (id) => personHref(id),
}: {
    hereId: string;
    /** The other record; null to search for it first. */
    target: MergeTarget | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Where the record kept opens when it isn't this one. */
    survivorHref?: (contactId: string) => string;
}) {
    const router = useRouter();
    const [other, setOther] = useState<MergeTarget | null>(target);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [readFailed, setReadFailed] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [carry, setCarry] = useState(true);
    const [confirmed, setConfirmed] = useState(false);
    const [merging, setMerging] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);

    const otherId = other?.contactId ?? null;
    useEffect(() => {
        if (!otherId) return;
        let live = true;
        void mergePreviewAction(hereId, otherId)
            .catch(() => ({
                ok: false as const,
                error: "Couldn't check what the merge would do.",
            }))
            .then((res) => {
                if (!live) return;
                if (!res.ok) return setReadFailed(res.error);
                const preview = res.data[res.offered];
                setLoaded({
                    previews: res.data,
                    keep: res.offered,
                    picks: defaultPicks(preview, hereId),
                });
            });
        return () => {
            live = false;
        };
    }, [hereId, otherId, attempt]);

    const preview = loaded ? loaded.previews[loaded.keep] : null;
    const rows = preview ? mergeRows(preview, hereId) : [];
    const names: Record<MergeColumn, string> | null = loaded
        ? {
              here: columnName(loaded.previews, hereId, "here"),
              there: columnName(
                  loaded.previews,
                  hereId,
                  "there",
                  other?.name ?? null,
              ),
          }
        : null;
    const account = preview ? accountView(preview, carry) : null;
    const offers =
        preview && loaded && names
            ? consentLines(preview, hereId, loaded.picks, names)
            : [];
    const block = preview ? mergeBlock(preview, carry, confirmed) : null;

    const keep = (column: MergeColumn) => {
        if (!loaded || loaded.keep === column) return;
        setFailure(null);
        setConfirmed(false);
        setLoaded({
            ...loaded,
            keep: column,
            picks: defaultPicks(loaded.previews[column], hereId),
        });
    };

    const pick = (row: MergeRow, column: MergeColumn) => {
        if (!loaded || !pickable(row, column)) return;
        setLoaded({
            ...loaded,
            picks: { ...loaded.picks, [row.key]: column },
        });
    };

    async function merge() {
        if (!loaded || !preview || !otherId || !names || block || merging) {
            return;
        }
        setMerging(true);
        setFailure(null);
        const res = await mergeAction(
            hereId,
            otherId,
            mergeBody(preview, hereId, loaded.picks, carry, confirmed),
        ).catch(() => ({
            ok: false as const,
            error: "Couldn't reach Saroh to merge them. Nothing has changed.",
        }));
        setMerging(false);
        if (!res.ok) return setFailure(res.error);
        const gone = loaded.keep === "here" ? names.there : names.here;
        onOpenChange(false);
        showSuccess(mergedToast(gone));
        if (res.data.survivorId === hereId) router.refresh();
        else router.push(survivorHref(res.data.survivorId));
    }

    const otherName = names?.there ?? other?.name ?? "the other record";

    return (
        <FormSheet
            wide
            open={open}
            title="Merge with a duplicate"
            description={
                other
                    ? mergeSubtitle(other.from, otherName)
                    : "Find the record that's the same person as this one."
            }
            pending={merging}
            doneOnly={!other}
            doneLabel="Cancel"
            saveLabel="Merge records"
            savingLabel="Merging…"
            saveOff={!preview || !!block}
            fieldsClassName="block"
            footNote={
                failure ? (
                    <p
                        role="alert"
                        className="text-[12.5px] text-destructive-subtle-foreground"
                    >
                        {failure}
                    </p>
                ) : block && !preview?.refusals.length ? (
                    <p className="text-[12px] text-muted-foreground">{block}</p>
                ) : null
            }
            onClose={() => onOpenChange(false)}
            onSubmit={merge}
        >
            {!other ? (
                <MergeSearch
                    hereId={hereId}
                    onPick={(p) =>
                        setOther({
                            contactId: p.contactId,
                            name: p.name,
                            from: "search",
                        })
                    }
                />
            ) : readFailed ? (
                <Notice role="alert" className="mt-3.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className="flex-[1_1_220px] text-[13px] text-foreground/75">
                            {readFailed} Nothing has changed.
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setReadFailed(null);
                                setAttempt((n) => n + 1);
                            }}
                        >
                            Try again
                        </Button>
                    </div>
                </Notice>
            ) : !loaded || !preview || !names || !account ? (
                <p
                    role="status"
                    className="mt-3.5 text-[12.5px] text-muted-foreground"
                >
                    Checking what would move…
                </p>
            ) : (
                <>
                    <div className="mt-3.5 grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-[12.5px] sm:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)]">
                        <span />
                        {COLUMNS.map((c) => (
                            <span key={c} className="label min-w-0 break-words">
                                {columnHeading(
                                    loaded.previews,
                                    hereId,
                                    c,
                                    other.name,
                                )}
                            </span>
                        ))}
                        <div
                            role="radiogroup"
                            aria-label="Which record stays"
                            className="contents"
                        >
                            <span className="text-muted-foreground">Stays</span>
                            {COLUMNS.map((c) => (
                                <Choice
                                    key={c}
                                    on={loaded.keep === c}
                                    disabled={merging}
                                    onClick={() => keep(c)}
                                >
                                    {c === "here"
                                        ? "Keep this record"
                                        : `Keep ${names.there}`}
                                </Choice>
                            ))}
                        </div>
                        {rows.map((row) => (
                            <div
                                key={row.key}
                                role="radiogroup"
                                aria-label={row.label}
                                className="contents"
                            >
                                <span className="text-muted-foreground">
                                    {row.label}
                                </span>
                                {COLUMNS.map((c) => (
                                    <Choice
                                        key={c}
                                        on={loaded.picks[row.key] === c}
                                        empty={!pickable(row, c)}
                                        disabled={merging}
                                        onClick={() => pick(row, c)}
                                    >
                                        {row.values[c] ??
                                            "Nothing to take from this record"}
                                    </Choice>
                                ))}
                            </div>
                        ))}
                    </div>

                    <p className="mt-3 text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                        Pick the right value in each row.{" "}
                        {movesLine(preview, names[loaded.keep])} Orders and
                        invoices keep the details they were placed with. This
                        cannot be undone.
                    </p>

                    {offers.length ? (
                        <ul className="mt-2.5 grid gap-0.5 text-[12.5px] text-foreground/75">
                            {offers.map((l) => (
                                <li key={l}>{l}</li>
                            ))}
                        </ul>
                    ) : null}

                    {account.lines.length || account.canLeaveBehind ? (
                        <AccountBox
                            lines={account.lines}
                            canLeaveBehind={account.canLeaveBehind}
                            carry={carry}
                            onCarry={(v) => {
                                setCarry(v);
                                setConfirmed(false);
                            }}
                            needsConfirm={account.needsConfirm}
                            confirmed={confirmed}
                            onConfirm={setConfirmed}
                            disabled={merging}
                        />
                    ) : null}

                    {preview.refusals.length ? (
                        <Notice tone="error" role="note" className="mt-3">
                            {preview.refusals.map((r) => (
                                <p key={r.message}>{r.message}.</p>
                            ))}
                        </Notice>
                    ) : null}
                </>
            )}
        </FormSheet>
    );
}
