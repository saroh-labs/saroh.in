"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useId, useState, useTransition } from "react";

import { moduleOverrideAction } from "@/lib/business-actions";
import { todayIso } from "@/lib/format";
import type { OfferOptions } from "@/lib/offer-words";
import {
    confirmLabel,
    doneMessage,
    draftFrom,
    EMPTY_FIELDS,
} from "@/lib/offer-words";

import {
    ReasonField,
    selectClass,
    useAttemptKey,
    useOfferOptions,
    useOfferPreview,
    WhatTheyllSee,
} from "./offer-parts";

/**
 * Take away a module… (admin plan U5, R5), under ⋯ More actions. Not an
 * offer: a Platform owner's alone, with a reason, and refused for any
 * module their paid plan includes (an override is a gift; it never takes
 * away what is paid for). The API decides both, in the dry run and again
 * in the write; a module their paid plan includes is listed, disabled, so
 * the operator sees why it can't be picked.
 *
 * Nothing in the module is deleted: it leaves their workspace until the
 * end date, or until someone ends the override.
 */
export function TakeAwaySheet({
    organizationId,
    businessName,
    onOpenChange,
    onDone,
    checkDelayMs = 350,
}: {
    organizationId: string;
    businessName: string;
    onOpenChange: (open: boolean) => void;
    onDone?: (message: string) => void;
    checkDelayMs?: number;
}) {
    const options = useOfferOptions(organizationId);
    return (
        <Sheet open onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
                <SheetHeader className="border-b px-6 pb-3.5 pt-5 text-left">
                    <SheetTitle>Take away a module</SheetTitle>
                    <SheetDescription>
                        {businessName}. Only what Saroh gave them, never what
                        their paid plan includes.
                    </SheetDescription>
                </SheetHeader>
                {options.status === "loading" ? (
                    <p className="px-6 py-5 text-sm text-muted-foreground">
                        Loading their modules…
                    </p>
                ) : options.status === "failed" ? (
                    <p
                        className="px-6 py-5 text-sm text-destructive"
                        role="alert"
                    >
                        {options.error}
                    </p>
                ) : (
                    <TakeAwayForm
                        organizationId={organizationId}
                        businessName={businessName}
                        options={options.data}
                        onClose={() => onOpenChange(false)}
                        onDone={onDone}
                        checkDelayMs={checkDelayMs}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}

function TakeAwayForm({
    organizationId,
    businessName,
    options,
    onClose,
    onDone,
    checkDelayMs,
}: {
    organizationId: string;
    businessName: string;
    options: OfferOptions;
    onClose: () => void;
    onDone?: (message: string) => void;
    checkDelayMs: number;
}) {
    const id = useId();
    const on = options.modules.filter((m) => m.state === "on");
    const [moduleKey, setModuleKey] = useState(
        () => on.find((m) => !m.paidPlanIncludes)?.id ?? "",
    );
    const [until, setUntil] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const attemptKey = useAttemptKey();

    const option = options.kinds.remove;
    const parsed = option.available
        ? draftFrom("remove", { ...EMPTY_FIELDS, moduleKey, until })
        : { draft: null, error: option.why };
    const { state, draftKey } = useOfferPreview(
        organizationId,
        parsed,
        checkDelayMs,
    );
    const preview = state.status === "ok" ? state.preview : null;
    const ready = preview !== null && reason.trim().length >= 4 && !pending;

    function confirm() {
        const d = parsed.draft;
        if (!preview || !d) return;
        const idempotencyKey = attemptKey(draftKey);
        setError(null);
        startTransition(async () => {
            const result = await moduleOverrideAction(organizationId, {
                reason: reason.trim(),
                idempotencyKey,
                kind: "remove",
                moduleKey: d.moduleKey ?? "",
                expiresAt: d.expiresAt,
            });
            if (!result.ok) {
                setError(result.error);
                return;
            }
            onDone?.(doneMessage(preview, businessName));
            onClose();
        });
    }

    return (
        <form
            className="flex flex-1 flex-col"
            onSubmit={(event) => {
                event.preventDefault();
                if (ready) confirm();
            }}
        >
            <div className="grid flex-1 content-start gap-5 px-6 py-5">
                {option.available ? (
                    <>
                        <div className="grid gap-1.5">
                            <Label htmlFor={`${id}-module`}>Module</Label>
                            <select
                                id={`${id}-module`}
                                className={selectClass}
                                value={moduleKey}
                                onChange={(e) => {
                                    setError(null);
                                    setModuleKey(e.target.value);
                                }}
                                disabled={pending}
                            >
                                {on.map((m) => (
                                    <option
                                        key={m.id}
                                        value={m.id}
                                        disabled={m.paidPlanIncludes}
                                    >
                                        {m.paidPlanIncludes
                                            ? `${m.name} (in their paid plan)`
                                            : m.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={`${id}-until`}>
                                Until (optional)
                            </Label>
                            <Input
                                id={`${id}-until`}
                                type="date"
                                min={todayIso()}
                                value={until}
                                onChange={(e) => setUntil(e.target.value)}
                                disabled={pending}
                            />
                            <p className="text-xs text-muted-foreground">
                                Leave it empty and it stays away until someone
                                ends it.
                            </p>
                        </div>
                    </>
                ) : null}
                <ReasonField
                    id={`${id}-reason`}
                    value={reason}
                    onChange={setReason}
                    disabled={pending}
                />
                <WhatTheyllSee
                    state={state}
                    idle="Pick a module to see what they'll see."
                />
                {error && (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}
            </div>
            <SheetFooter className="flex-row flex-wrap justify-end gap-2.5 border-t px-6 py-3.5">
                <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={pending}
                >
                    Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={!ready}>
                    {pending
                        ? "Working…"
                        : preview
                          ? confirmLabel(preview)
                          : "Take it away"}
                </Button>
            </SheetFooter>
        </form>
    );
}
