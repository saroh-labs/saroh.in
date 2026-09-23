"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import type { ReactNode } from "react";
import { useId, useState, useTransition } from "react";

export interface OperatorSubmit {
    reason: string;
    idempotencyKey: string;
    /** Every named field inside `fields`, as text. */
    values: Partial<Record<string, string>>;
}

/**
 * The one shape every operator write takes in the console: a button that
 * opens a dialog saying exactly what will change, a written reason, and —
 * for anything that takes a business down — the business's name typed back.
 *
 * The idempotency key is minted when the dialog opens and kept for that
 * attempt, so a double submit or a retry after a dropped response is the same
 * request, and the API applies it once. The API enforces the reason and the
 * name too; the dialog only makes the rule visible before it is hit.
 */
export function OperatorDialog({
    trigger,
    triggerVariant = "outline",
    title,
    effect,
    confirmName,
    fields,
    submitLabel,
    destructive = false,
    reasonRequired = true,
    disabled = false,
    disabledReason,
    onSubmit,
}: {
    trigger: string;
    triggerVariant?:
        "outline" | "secondary" | "destructive" | "default" | "ghost";
    title: string;
    /** What will change, in a sentence or two. */
    effect: ReactNode;
    /** When set, the operator must type this exactly before submitting. */
    confirmName?: string;
    /** Extra inputs, each with a `name`, read back on submit. */
    fields?: ReactNode;
    submitLabel: string;
    destructive?: boolean;
    reasonRequired?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    onSubmit: (
        input: OperatorSubmit,
    ) => Promise<{ ok: boolean; error?: string }>;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [key, setKey] = useState("");
    const [reason, setReason] = useState("");
    const [typed, setTyped] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const nameOk = confirmName === undefined || typed.trim() === confirmName;
    const reasonOk = !reasonRequired || reason.trim().length >= 4;

    function onOpenChange(next: boolean) {
        setOpen(next);
        if (next) {
            setKey(crypto.randomUUID());
            setReason("");
            setTyped("");
            setError(null);
        }
    }

    function submit(form: HTMLFormElement) {
        const values: Record<string, string> = {};
        new FormData(form).forEach((value, name) => {
            if (typeof value === "string") values[name] = value;
        });
        setError(null);
        startTransition(async () => {
            const result = await onSubmit({
                reason: reason.trim(),
                idempotencyKey: key,
                values,
            });
            if (!result.ok) {
                setError(result.error ?? "That did not work. Nothing changed.");
                return;
            }
            setOpen(false);
        });
    }

    return (
        <div className="flex flex-col items-start gap-1">
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant={triggerVariant}
                        disabled={disabled}
                    >
                        {trigger}
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                    <form
                        className="grid gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submit(event.currentTarget);
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{title}</DialogTitle>
                            <DialogDescription asChild>
                                <div className="text-sm text-muted-foreground">
                                    {effect}
                                </div>
                            </DialogDescription>
                        </DialogHeader>

                        {fields}

                        {reasonRequired && (
                            <div className="grid gap-1.5">
                                <Label htmlFor={`${id}-reason`}>
                                    Reason (kept in the audit trail)
                                </Label>
                                <Textarea
                                    id={`${id}-reason`}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={3}
                                    required
                                    minLength={4}
                                    maxLength={500}
                                    disabled={pending}
                                />
                            </div>
                        )}

                        {confirmName !== undefined && (
                            <div className="grid gap-1.5">
                                <Label htmlFor={`${id}-confirm`}>
                                    Type <strong>{confirmName}</strong> to
                                    confirm
                                </Label>
                                <Input
                                    id={`${id}-confirm`}
                                    name="confirmName"
                                    value={typed}
                                    onChange={(e) => setTyped(e.target.value)}
                                    autoComplete="off"
                                    disabled={pending}
                                />
                            </div>
                        )}

                        {error && (
                            <p
                                className="text-sm text-destructive"
                                role="alert"
                            >
                                {error}
                            </p>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                                disabled={pending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant={
                                    destructive ? "destructive" : "default"
                                }
                                disabled={pending || !nameOk || !reasonOk}
                            >
                                {pending ? "Working…" : submitLabel}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            {disabled && disabledReason && (
                <p className="text-xs text-muted-foreground">
                    {disabledReason}
                </p>
            )}
        </div>
    );
}
