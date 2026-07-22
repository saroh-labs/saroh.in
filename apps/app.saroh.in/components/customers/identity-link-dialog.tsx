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
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { linkCustomerAction } from "@/lib/customer-workspace/actions";
import type { IdentitySuggestion } from "@/lib/customer-workspace/service";

/**
 * Confirm a customer identity link (#120). Saroh never merges people
 * automatically — this dialog shows commerce Customers that matched THIS contact
 * on an exact email/phone, and a person confirms the link. Linking connects the
 * records (it does not merge them) and is reversible.
 */
export function IdentityLinkDialog({
    contactId,
    suggestions,
}: {
    contactId: string;
    suggestions: IdentitySuggestion[];
}) {
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    const confirm = (customerId: string) => {
        startTransition(async () => {
            const result = await linkCustomerAction(contactId, customerId);
            if (result.ok) {
                toast.success("Customer linked");
                setOpen(false);
            } else {
                toast.error(result.error);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    Link commerce record
                    {suggestions.length > 0 ? ` (${suggestions.length})` : ""}
                </Button>
            </DialogTrigger>
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
                    <ul className="divide-y rounded-lg border">
                        {suggestions.map((s) => (
                            <li
                                key={s.customerId}
                                className="flex items-center justify-between gap-4 p-3"
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
                                    disabled={pending}
                                    onClick={() => confirm(s.customerId)}
                                >
                                    Link
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
