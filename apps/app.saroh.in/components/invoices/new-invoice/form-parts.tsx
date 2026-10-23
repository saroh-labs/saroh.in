"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { TRY_AGAIN } from "@saroh/ui/lib/state-copy";
import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";

import type { SaveState } from "@/lib/editor-shell/state";

import { saveWords } from "./use-invoice-draft";

/**
 * Beside the title (INVNewA's "Draft · saved"): whether what is on screen
 * is saved, and Try again after a save that failed. Nothing before the
 * first keystroke of a new invoice.
 */
export function SavePill({
    state,
    hasDraft,
    onRetry,
}: {
    state: SaveState;
    hasDraft: boolean;
    onRetry: () => void;
}) {
    const pill = saveWords(state, hasDraft);
    if (!pill) return null;
    return (
        <span className="inline-flex items-center gap-2">
            <Badge variant="neutral" aria-live="polite">
                {pill.label}
            </Badge>
            {pill.failed ? (
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    onClick={onRetry}
                >
                    {TRY_AGAIN}
                </Button>
            ) : null}
        </span>
    );
}

/**
 * Save draft, then Issue. Save draft is the form's one submit, so Enter
 * keeps it a draft; issuing numbers the invoice and locks its lines, so it
 * is a press of its own. Drawn in the header on a desk and in the foot on a
 * phone (one of the two is display:none, so each is pressed once).
 */
export function FormButtons({
    foot = false,
    off,
    intent,
    issueLabel,
    describedBy,
    onIssue,
}: {
    foot?: boolean;
    off: boolean;
    intent: "issue" | "draft" | null;
    issueLabel: string;
    /** Why Issue is off, while it is. */
    describedBy?: string;
    onIssue: () => void;
}) {
    const grow = foot ? "flex-1" : undefined;
    return (
        <>
            <Button
                type="submit"
                variant="outline"
                disabled={off}
                busy={intent === "draft"}
                busyLabel="Saving…"
                className={grow}
            >
                Save draft
            </Button>
            <Button
                type="button"
                disabled={off}
                aria-describedby={describedBy}
                onClick={onIssue}
                busy={intent === "issue"}
                busyLabel="Issuing…"
                className={grow}
            >
                {issueLabel}
            </Button>
        </>
    );
}

/** The phone's "See how it will look", which opens the paper in place. */
export function SeeItToggle({
    open,
    controls,
    onToggle,
}: {
    open: boolean;
    controls: string;
    onToggle: () => void;
}) {
    return (
        <Button
            type="button"
            variant="link"
            size="inline"
            aria-expanded={open}
            aria-controls={controls}
            onClick={onToggle}
            className="min-h-11 justify-start gap-1.5 text-foreground sm:hidden"
        >
            {open ? (
                <EyeOff aria-hidden className="size-4" />
            ) : (
                <Eye aria-hidden className="size-4" />
            )}
            {open ? "Hide how it will look" : "See how it will look"}
        </Button>
    );
}

/** A phone's foot (INVNewAPhone): the total, then both buttons, above the tab bar. */
export function PhoneFoot({
    total,
    children,
}: {
    total: string;
    children: ReactNode;
}) {
    return (
        <div
            data-testid="phone-foot"
            className="sticky bottom-[var(--tab-bar-inset)] z-10 -mx-4 mt-4 grid gap-2 border-t border-border bg-card px-4 py-3 dark:bg-background sm:hidden"
        >
            <p className="flex items-baseline justify-between text-[15px] font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{total}</span>
            </p>
            <div className="flex gap-2">{children}</div>
        </div>
    );
}
