"use client";

import { FormDialog } from "@/components/shared/form-dialog";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { useEffect, useId, useState } from "react";

import { runAction } from "@/lib/api/run-action";
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
import { Notice } from "@saroh/ui/notice";

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
    const [tried, setTried] = useState(false);

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
        setTried(true);
        if (!canRemove || removing) return;
        setFailure(null);
        const res = await runAction(() => removeDetailsAction(contactId), {
            setBusy: setRemoving,
            // Said in the dialog, beside what it was about to remove.
            quiet: true,
            onUnreached: setFailure,
        });
        if (!res) return;
        if (!res.ok) {
            setFailure(asSentence(res.error));
            return;
        }
        onRemoved();
    }

    return (
        <FormDialog
            open={open}
            size="md"
            title={`Remove ${name}'s details?`}
            description={
                preview
                    ? removalBody(preview)
                    : "Their name, email, phone and address are removed. This cannot be undone."
            }
            pending={removing}
            tone="destructive"
            cancelLabel="Keep details"
            saveLabel="Remove details"
            savingLabel="Removing…"
            saveOff={!preview || refused.length > 0}
            fieldsClassName="block"
            onClose={() => onOpenChange(false)}
            onSubmit={remove}
        >
            {readFailed ? (
                <Notice role="alert">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className="flex-[1_1_220px] text-[13px] text-foreground/75">
                            {readFailed} Nothing has changed.
                        </span>
                        <Button
                            size="sm"
                            type="button"
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
            ) : !preview ? (
                <p
                    role="status"
                    className="mt-3.5 text-[12.5px] text-muted-foreground"
                >
                    Checking what would go…
                </p>
            ) : refused.length ? (
                <Notice tone="error" role="note" className="mt-3.5">
                    {refused.map((r) => (
                        <p key={r.message}>{asSentence(r.message)}</p>
                    ))}
                </Notice>
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
                aria-invalid={(tried && !matches) || undefined}
                aria-label="Type the customer's name to confirm"
                autoComplete="off"
                spellCheck={false}
                disabled={removing || refused.length > 0}
                className="mt-1.5 px-2.5"
            />

            {tried && !matches && refused.length === 0 ? (
                <p
                    role="alert"
                    className="mt-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    Type {name} exactly to confirm.
                </p>
            ) : null}
            {failure ? (
                <p
                    role="alert"
                    className="mt-3 text-[12.5px] text-destructive-subtle-foreground"
                >
                    {failure}
                </p>
            ) : null}
        </FormDialog>
    );
}
