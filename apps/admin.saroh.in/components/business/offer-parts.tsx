"use client";

import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { useEffect, useRef, useState } from "react";

import { offerOptionsAction, previewOfferAction } from "@/lib/business-actions";
import type { OfferDraft, OfferOptions, OfferPreview } from "@/lib/offer-words";
import { offerable, previewLines } from "@/lib/offer-words";

/**
 * What the offer sheet and Take away a module… share (admin plan U5): the
 * options read when a sheet opens, the dry run as the operator fills it
 * in, the reason, "What they'll see", and the idempotency key of each
 * attempt. The API decides; these only ask it and say its answer.
 */

export type OptionsState =
    | { status: "loading" }
    | { status: "ok"; data: OfferOptions }
    | { status: "failed"; error: string };

/** The options, read once when the sheet mounts (it mounts on open). */
export function useOfferOptions(organizationId: string): OptionsState {
    const [state, setState] = useState<OptionsState>({ status: "loading" });
    useEffect(() => {
        let live = true;
        offerOptionsAction(organizationId)
            .then((r) => {
                if (!live) return;
                setState(
                    r.ok
                        ? { status: "ok", data: offerable(r.data) }
                        : { status: "failed", error: r.error },
                );
            })
            .catch(() => {
                if (live) {
                    setState({
                        status: "failed",
                        error: "Couldn't load what can be offered. Nothing has changed; try again in a moment.",
                    });
                }
            });
        return () => {
            live = false;
        };
    }, [organizationId]);
    return state;
}

export type PreviewState =
    | { status: "idle" }
    | { status: "invalid"; error: string }
    | { status: "checking" }
    | { status: "ok"; preview: OfferPreview }
    | { status: "refused"; error: string };

const CHECK_FAILED = "Couldn't check what they'd see. Try again in a moment.";

/**
 * The dry run of the draft, run a moment after the operator stops typing
 * and again whenever the draft changes. An answer for an older draft is
 * dropped, so what shows is always for what is filled in now.
 */
export function useOfferPreview(
    organizationId: string,
    { draft, error }: { draft: OfferDraft | null; error: string | null },
    delayMs: number,
): { state: PreviewState; draftKey: string } {
    const draftKey = draft ? JSON.stringify(draft) : "";
    const [answer, setAnswer] = useState<{
        for: string;
        state: PreviewState;
    } | null>(null);

    useEffect(() => {
        if (!draftKey) return;
        let live = true;
        const timer = setTimeout(() => {
            previewOfferAction(
                organizationId,
                JSON.parse(draftKey) as OfferDraft,
            )
                .then((r) => {
                    if (!live) return;
                    setAnswer({
                        for: draftKey,
                        state: r.ok
                            ? { status: "ok", preview: r.data }
                            : { status: "refused", error: r.error },
                    });
                })
                .catch(() => {
                    if (live) {
                        setAnswer({
                            for: draftKey,
                            state: { status: "refused", error: CHECK_FAILED },
                        });
                    }
                });
        }, delayMs);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [organizationId, draftKey, delayMs]);

    const state: PreviewState = !draft
        ? error
            ? { status: "invalid", error }
            : { status: "idle" }
        : answer?.for === draftKey
          ? answer.state
          : { status: "checking" };
    return { state, draftKey };
}

/**
 * One idempotency key per attempt: minted at the first confirm of a draft
 * and kept while that draft is retried, so a double press or a retry after
 * a dropped answer applies it once. A changed draft is a new attempt.
 */
export function useAttemptKey(): (draftKey: string) => string {
    const attempt = useRef<{ for: string; key: string } | null>(null);
    return (draftKey: string) => {
        if (attempt.current?.for !== draftKey) {
            attempt.current = { for: draftKey, key: crypto.randomUUID() };
        }
        return attempt.current.key;
    };
}

/** "What they'll see": the dry run's answer in sentences, or why not yet. */
export function WhatTheyllSee({
    state,
    idle = "Fill in the offer to see what they'll see.",
}: {
    state: PreviewState;
    idle?: string;
}) {
    return (
        <div
            className="grid gap-1.5 rounded-lg bg-muted p-3.5 text-sm"
            role="status"
            aria-live="polite"
            data-what-they-see
        >
            <p className="font-semibold">What they&apos;ll see</p>
            {state.status === "ok" ? (
                <ul className="grid gap-1 text-muted-foreground">
                    {previewLines(state.preview).map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            ) : state.status === "checking" ? (
                <p className="text-muted-foreground">Checking…</p>
            ) : state.status === "refused" || state.status === "invalid" ? (
                <p className="text-destructive" data-refused>
                    {state.error}
                </p>
            ) : (
                <p className="text-muted-foreground">{idle}</p>
            )}
        </div>
    );
}

/** The reason every write asks for, kept on the record. */
export function ReasonField({
    id,
    value,
    onChange,
    disabled,
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
}) {
    const short = value.trim().length > 0 && value.trim().length < 4;
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>Why? (kept on the record)</Label>
            <Textarea
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={2}
                required
                minLength={4}
                maxLength={500}
                disabled={disabled}
                aria-describedby={short ? `${id}-short` : undefined}
            />
            {short && (
                <p id={`${id}-short`} className="text-xs text-muted-foreground">
                    A few more words: at least 4 characters.
                </p>
            )}
        </div>
    );
}

export const selectClass =
    "h-[38px] w-full rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11";
