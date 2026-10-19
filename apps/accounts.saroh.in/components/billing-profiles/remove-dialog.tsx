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
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { removeProfileAction } from "@/lib/billing-profile-actions";

/**
 * Remove a profile nothing uses (F6). Its way out is "Keep it"; invoices
 * Saroh already sent to it keep its details.
 */
export function RemoveDialog({
    id,
    name,
    open,
    onClose,
}: {
    id: string;
    name: string;
    open: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function remove() {
        setBusy(true);
        const res = await removeProfileAction(id).catch(() => null);
        setBusy(false);
        if (!res) {
            showError("That couldn't be removed just now. Try again.");
            return;
        }
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(`${name} is removed.`);
        onClose();
        router.push("/account/billing-profiles");
    }

    return (
        <AlertDialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
            <AlertDialogContent className="max-w-[440px] gap-3 px-[22px] py-5">
                <AlertDialogHeader className="text-left">
                    <AlertDialogTitle className="font-display text-lg font-semibold tracking-[-0.02em]">
                        Remove {name}?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="dark:text-muted-foreground flex flex-col gap-2 text-[13px] leading-[1.55] text-neutral-700">
                            <span>
                                No business uses it, so nothing about your
                                billing changes.
                            </span>
                            <span>
                                Invoices Saroh already sent to it stay in your
                                records and keep these details.
                            </span>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-1">
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <Button
                        type="button"
                        variant="destructive"
                        busy={busy}
                        busyLabel="Removing…"
                        onClick={() => void remove()}
                    >
                        Remove profile
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
