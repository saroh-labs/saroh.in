"use client";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { useEffect, useId, useState } from "react";

import {
    removalPreviewAction,
    removeDetailsAction,
} from "@/lib/contacts/actions";
import {
    asSentence,
    confirmMatches,
    removalBody,
} from "@/lib/contacts/removal";
import type { RemovalPreview } from "@/lib/contacts/service";

const SMALL_BTN =
    "h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11";

/**
 * "Remove their details (privacy request)…" (DEC-042, C11), after the
 * dialog in Saroh Customer Detail: what goes, that their orders stay, and
 * the name typed to confirm before Remove details wakes. It reads what the
 * removal would do first, so a refusal (an open order, a live
 * subscription) is said before anyone types, and Remove stays off. Final:
 * there is no Undo, and it says so.
 */
export function RemoveDetailsDialog({
    contactId,
    name,
    open,
    onOpenChange,
    onRemoved,
}: {
    contactId: string;
    /** Their name as the page shows it: what is typed to confirm. */
    name: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRemoved: () => void;
}) {
    const inputId = useId();
    const [preview, setPreview] = useState<RemovalPreview | null>(null);
    const [readFailed, setReadFailed] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [typed, setTyped] = useState("");
    const [removing, setRemoving] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);

    // Read on opening (the screen mounts the dialog when it opens), and
    // again on Try again.
    useEffect(() => {
        let live = true;
        void removalPreviewAction(contactId)
            .catch(() => ({
                ok: false as const,
                error: "Couldn't check what removing them would do.",
            }))
            .then((res) => {
                if (!live) return;
                if (res.ok) setPreview(res.data);
                else setReadFailed(asSentence(res.error));
            });
        return () => {
            live = false;
        };
    }, [contactId, attempt]);

    const refused = preview?.refusals ?? [];
    const matches = confirmMatches(typed, name);
    const canRemove = !!preview && refused.length === 0 && matches;

    async function remove() {
        if (!canRemove || removing) return;
        setRemoving(true);
        setFailure(null);
        const res = await removeDetailsAction(contactId);
        setRemoving(false);
        if (!res.ok) {
            setFailure(asSentence(res.error));
            return;
        }
        onRemoved();
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(o) => {
                if (removing) return;
                onOpenChange(o);
            }}
        >
            <AlertDialogContent className="block max-w-[440px] gap-0 rounded-[14px] px-[22px] py-5 sm:rounded-[14px]">
                <AlertDialogTitle className="font-display text-[18px] font-semibold">
                    Remove {name}&apos;s details?
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-[7px] text-pretty text-[13px] leading-[1.55] text-foreground/75">
                    {preview
                        ? removalBody(preview)
                        : "Their name, email, phone and address are removed and cannot be brought back."}
                </AlertDialogDescription>

                {readFailed ? (
                    <div
                        role="alert"
                        className="mt-3.5 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border-strong bg-muted px-[13px] py-2.5"
                    >
                        <span className="flex-[1_1_220px] text-[13px] text-foreground/75">
                            {readFailed} Nothing has changed.
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setReadFailed(null);
                                setAttempt((n) => n + 1);
                            }}
                            className="h-[30px] rounded-[8px] px-[11px] text-[12.5px] font-semibold coarse:h-11"
                        >
                            Try again
                        </Button>
                    </div>
                ) : !preview ? (
                    <p
                        role="status"
                        className="mt-3.5 text-[12.5px] text-muted-foreground"
                    >
                        Checking what would go…
                    </p>
                ) : refused.length ? (
                    <div
                        role="note"
                        className="mt-3.5 rounded-[10px] bg-destructive-subtle px-[13px] py-2.5 text-[12.5px] text-destructive-subtle-foreground"
                    >
                        {refused.map((r) => (
                            <p key={r.message}>{asSentence(r.message)}</p>
                        ))}
                    </div>
                ) : null}

                <label
                    htmlFor={inputId}
                    className="mt-3.5 block text-[12.5px] font-medium"
                >
                    Type {name} to confirm
                </label>
                <Input
                    id={inputId}
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            void remove();
                        }
                    }}
                    aria-label="Type the customer's name to confirm"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={removing || refused.length > 0}
                    className="mt-1.5 h-9 rounded-[8px] px-2.5 text-[13px]"
                />

                {failure ? (
                    <p
                        role="alert"
                        className="mt-3 text-[12.5px] text-destructive-subtle-foreground"
                    >
                        {failure}
                    </p>
                ) : null}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={removing}
                        onClick={() => onOpenChange(false)}
                        className={SMALL_BTN}
                    >
                        Keep them
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={!canRemove || removing}
                        onClick={() => void remove()}
                        className={SMALL_BTN}
                    >
                        {removing ? "Removing…" : "Remove details"}
                    </Button>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
