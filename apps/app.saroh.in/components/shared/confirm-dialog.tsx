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
import type { LucideIcon } from "lucide-react";
import { Trash2 } from "lucide-react";

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
 *
 * Drawn as the brand file's destructive confirm (§14): a Destructive-tinted
 * mark, the title in Space Grotesk, the blast radius in the body, and the verb
 * on the button — never "OK". The body should say what survives and end with
 * "This cannot be undone."; if that sentence would be untrue, the action wants
 * an Undo, not a confirm.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel = "Cancel",
    onConfirm,
    icon: Icon = Trash2,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    /** Verb plus noun, e.g. "Delete page" (07 §4). */
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    /** The mark: a bin unless what goes is not deleted (Stop tracking). */
    icon?: LucideIcon;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[384px] gap-0 overflow-hidden p-0 sm:rounded-xl">
                <AlertDialogHeader className="flex-row items-start gap-[13px] space-y-0 px-[22px] pb-1.5 pt-5 text-left">
                    <span
                        aria-hidden
                        className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-destructive-subtle text-destructive-subtle-foreground"
                    >
                        <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <AlertDialogTitle className="mb-1.5 font-display text-[17px] font-semibold tracking-[-0.02em]">
                            {title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[13px] leading-[1.55] text-neutral-600 dark:text-muted-foreground">
                            {description}
                        </AlertDialogDescription>
                    </div>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 px-[22px] py-[18px] sm:space-x-0">
                    <AlertDialogCancel className="mt-0">
                        {cancelLabel}
                    </AlertDialogCancel>
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
