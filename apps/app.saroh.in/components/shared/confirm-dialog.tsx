"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { buttonVariants } from "@saroh/ui/button";

/**
 * A confirmation for an action that cannot be undone, in place of
 * `window.confirm()` (00-universal.md §9).
 *
 * Controlled, because each caller decides WHAT is being confirmed at the
 * moment it opens: a page chosen from a row's menu, the section that happens
 * to be selected. `DisableDialog` in module-card.tsx is the uncontrolled form
 * of the same thing, for a single fixed trigger.
 *
 * The native dialog this replaces blocked the whole tab, could not be styled
 * or read by the design system, and on some phones rendered the page's URL as
 * its title. The copy callers pass is the copy they already had: it names the
 * thing and the cost, not "are you sure".
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel = "Cancel",
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    /** Verb plus noun, e.g. "Delete page" (07 §4). */
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                        className={buttonVariants({ variant: "destructive" })}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
