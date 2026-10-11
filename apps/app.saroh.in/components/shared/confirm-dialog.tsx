"use client";

import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import type { LucideIcon } from "lucide-react";
import { CircleHelp, Trash2 } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useState } from "react";

import { Refusal } from "./refusal";

/**
 * What a confirmed action said. Nothing, or `true`: it worked, and the
 * dialog closes. `false`, or `ok: false` with the reason: it was refused,
 * and the dialog stays open saying why.
 */
export type ConfirmResult = void | boolean | { ok: boolean; error?: string };

/**
 * The same action run from a button that asked nothing: say its refusal
 * as a toast, since there is no confirm open to say it in.
 */
export function sayRefusal(result: ConfirmResult): void {
    if (typeof result === "object" && !result.ok) {
        showError(result.error ?? CONFIRM_FAILED);
    }
}

/** Said when an action threw, or was refused without a sentence. */
export const CONFIRM_FAILED = "That didn't work. Try again.";

/**
 * The one confirm (UX audit, 10 Oct), in place of `window.confirm()`
 * (00-universal.md §9), and only for what cannot be undone. Anything that
 * can be taken back is done at once with `showUndo` and asks nothing.
 *
 * - The title is the verb and the thing as a question, the name without
 *   quotes: "Delete Summer menu?".
 * - The body says what goes, what stays, and ends "This cannot be
 *   undone.".
 * - The way out says what is kept ("Keep page") and has the keyboard
 *   first. The button is the verb and the thing ("Delete page").
 * - `onConfirm` is waited for. While it runs the button says so
 *   ("Deleting…"), both buttons wait, and nothing closes the dialog. A
 *   refusal keeps it open with the reason (`Refusal`: a quiet note when
 *   the person's role refused it, the error otherwise). It closes only on
 *   success.
 * - Red, with the bin, only when something is destroyed. A step that
 *   destroys nothing ("Turn on Track stock", "Make a new link") is
 *   `tone="neutral"`: the ink button and a plain mark.
 *
 * Controlled, because each caller decides WHAT is being confirmed at the
 * moment it opens.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    busyLabel,
    keepLabel,
    onConfirm,
    tone = "destructive",
    icon,
    returnFocusTo,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: ReactNode;
    /** Verb plus noun, e.g. "Delete page" (07 §4). */
    confirmLabel: string;
    /** While it runs. Left out, it is read from the verb: "Deleting…". */
    busyLabel?: string;
    /** The way out, saying what is kept: "Keep page". */
    keepLabel: string;
    onConfirm: () => ConfirmResult | Promise<ConfirmResult>;
    tone?: "destructive" | "neutral";
    /** The mark: a bin when destroying, a question when not. */
    icon?: LucideIcon;
    /**
     * The button that opened it, for a caller with no trigger of its own:
     * closed, the keyboard goes back there if it is still on the page.
     */
    returnFocusTo?: RefObject<HTMLElement | null>;
    /** A choice the confirm carries, such as "Tell them by email". */
    children?: ReactNode;
}) {
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const destroys = tone === "destructive";
    const Icon = icon ?? (destroys ? Trash2 : CircleHelp);

    async function confirm() {
        if (busy) return;
        setBusy(true);
        setRefusal(null);
        let result: ConfirmResult;
        try {
            result = await onConfirm();
        } catch {
            result = false;
        }
        setBusy(false);
        const ok =
            result === undefined ||
            result === true ||
            (typeof result === "object" && result.ok);
        if (ok) {
            onOpenChange(false);
            return;
        }
        const said = typeof result === "object" ? result.error : undefined;
        setRefusal(said ?? CONFIRM_FAILED);
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (busy) return;
                // Each opening asks afresh.
                setRefusal(null);
                onOpenChange(next);
            }}
        >
            <AlertDialogContent
                className="max-w-[420px] gap-0 overflow-hidden p-0 sm:rounded-xl"
                onEscapeKeyDown={(e) => {
                    if (busy) e.preventDefault();
                }}
                {...(returnFocusTo
                    ? {
                          onCloseAutoFocus: (e: Event) => {
                              e.preventDefault();
                              returnFocusTo.current?.focus();
                          },
                      }
                    : {})}
            >
                <AlertDialogHeader className="flex-row items-start gap-[13px] space-y-0 px-[22px] pb-1.5 pt-5 text-left">
                    <span
                        aria-hidden
                        className={cn(
                            "flex size-[34px] shrink-0 items-center justify-center rounded-full",
                            destroys
                                ? "bg-destructive-subtle text-destructive-subtle-foreground"
                                : "bg-muted text-foreground",
                        )}
                    >
                        <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <AlertDialogTitle className="mb-1.5">
                            {title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[13px] leading-[1.55] text-neutral-600 dark:text-muted-foreground">
                            {description}
                        </AlertDialogDescription>
                    </div>
                </AlertDialogHeader>
                {children ? (
                    <div className="px-[22px] pt-2">{children}</div>
                ) : null}
                <Refusal className="mx-[22px] mt-2">{refusal}</Refusal>
                <AlertDialogFooter className="px-[22px] py-[18px]">
                    <AlertDialogCancel disabled={busy}>
                        {keepLabel}
                    </AlertDialogCancel>
                    <Button
                        type="button"
                        variant={destroys ? "destructive" : "default"}
                        busy={busy}
                        busyLabel={busyLabel ?? busyOf(confirmLabel)}
                        onClick={() => void confirm()}
                    >
                        {confirmLabel}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

const BUSY: Record<string, string> = {
    Delete: "Deleting…",
    Remove: "Removing…",
    Cancel: "Cancelling…",
    Discard: "Discarding…",
    Void: "Voiding…",
    Stop: "Stopping…",
    Turn: "Turning…",
    Make: "Making…",
    Send: "Sending…",
    Leave: "Leaving…",
    Disconnect: "Disconnecting…",
    End: "Ending…",
    Merge: "Merging…",
    Refund: "Refunding…",
    Archive: "Archiving…",
    Publish: "Publishing…",
    Record: "Recording…",
    Mark: "Marking…",
    Clear: "Clearing…",
    Reset: "Resetting…",
    Replace: "Replacing…",
    Revoke: "Revoking…",
    Take: "Taking…",
};

/** "Delete page" → "Deleting…"; "Turn on Track stock" → "Turning on…". */
export function busyOf(confirmLabel: string): string {
    const [verb = "", second = ""] = confirmLabel.split(" ");
    const busy = BUSY[verb];
    if (!busy) return "Working…";
    if (second === "on" || second === "off") {
        return `${busy.slice(0, -1)} ${second}…`;
    }
    return busy;
}
