"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState, useTransition } from "react";

import { linkCustomerAction } from "@/lib/customer-workspace/actions";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
} from "@/lib/customer-workspace/service";

/**
 * Confirm a customer identity link (#120). Saroh never merges people
 * automatically — this dialog shows commerce Customers that matched THIS contact
 * on an exact email/phone, and a person confirms the link. Linking connects the
 * records (it does not merge them) and is reversible.
 *
 * Customer Detail opens it from its "Possible match — link?" notice and its
 * More menu, so it can also be controlled, without a trigger of its own.
 * Another contact that looks like the same person is listed too, with
 * Merge (C10): two contacts are merged, never linked (DEC-042).
 */
export function IdentityLinkDialog({
    contactId,
    suggestions,
    duplicates = [],
    onMerge,
    open: controlled,
    onOpenChange,
}: {
    contactId: string;
    suggestions: IdentitySuggestion[];
    /** Other customer records that look like them (C2): merged, not linked. */
    duplicates?: DuplicateSuggestion[];
    /** Open the merge for one of them (C10); absent without `customer:merge`. */
    onMerge?: (duplicate: DuplicateSuggestion) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const [own, setOwn] = useState(false);
    const open = controlled ?? own;
    const setOpen = onOpenChange ?? setOwn;
    const [pending, startTransition] = useTransition();

    const confirm = (customerId: string) => {
        startTransition(async () => {
            const result = await linkCustomerAction(contactId, customerId);
            if (result.ok) {
                showSuccess("Customer linked");
                setOpen(false);
            } else {
                showError(result.error);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {controlled === undefined ? (
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                        Link commerce record
                        {suggestions.length > 0
                            ? ` (${suggestions.length})`
                            : ""}
                    </Button>
                </DialogTrigger>
            ) : null}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Link a commerce customer</DialogTitle>
                    <DialogDescription>
                        These commerce customers match this contact&apos;s exact
                        email or phone. Confirm only the ones that are the same
                        person — Saroh never merges automatically, and you can
                        unlink later.
                    </DialogDescription>
                </DialogHeader>

                {suggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No matching commerce customers found.
                    </p>
                ) : (
                    <ul className="divide-y rounded-xl border">
                        {suggestions.map((s, index) => (
                            <li
                                key={s.customerId}
                                style={
                                    { "--wk-i": index } as React.CSSProperties
                                }
                                className="wk-item flex items-center justify-between gap-4 p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {s.name}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {s.email} · matched on{" "}
                                        {s.matchedOn.join(" + ")}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    className="wk-press"
                                    disabled={pending}
                                    onClick={() => confirm(s.customerId)}
                                >
                                    Link
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}

                {duplicates.length > 0 ? (
                    <div className="grid gap-2">
                        <p className="text-sm text-muted-foreground">
                            These customer records look like the same person.
                            Two customers aren&apos;t linked — they&apos;re
                            merged into one.
                        </p>
                        <ul className="divide-y rounded-xl border">
                            {duplicates.map((dup) => (
                                <li
                                    key={dup.contactId}
                                    className="flex items-center justify-between gap-4 p-3"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                            {dup.name ??
                                                dup.email ??
                                                "Another record"}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {dup.email ? `${dup.email} · ` : ""}
                                            matched on{" "}
                                            {dup.matchedOn.join(" + ")}
                                        </p>
                                    </div>
                                    {onMerge ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={pending}
                                            onClick={() => {
                                                setOpen(false);
                                                onMerge(dup);
                                            }}
                                        >
                                            Merge…
                                        </Button>
                                    ) : (
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            An owner or admin can merge them
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
