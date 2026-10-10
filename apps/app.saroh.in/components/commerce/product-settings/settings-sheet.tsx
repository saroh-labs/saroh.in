"use client";

import { Button } from "@saroh/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import type { FormEventHandler, ReactElement, ReactNode } from "react";

/** A problem under a field, or at the foot of a sheet. */
export const PROBLEM =
    "text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground";

/**
 * The frame Product settings' side sheets share, as a location's sheets are
 * drawn (`PlaceSheetFrame`): the title and a line under it, the fields
 * (which scroll), and the primary button then Cancel at the foot.
 *
 * Nothing saves until the primary button. Cancel, Escape, the close button
 * and a press outside drop what was typed, unasked, and the sheet can't be
 * dismissed while a save is on its way. The button that opens it is the
 * sheet's trigger, so the keyboard goes back there when it closes. The
 * caller starts a fresh draft each time it opens.
 */
export function SettingsSheet({
    trigger,
    open,
    onOpenChange,
    title,
    description,
    pending,
    submitLabel = "Save",
    busyLabel = "Saving…",
    canSubmit = true,
    onSubmit,
    children,
}: {
    trigger: ReactElement;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    pending: boolean;
    submitLabel?: string;
    busyLabel?: string;
    /** False while the sheet has nothing it could save yet. */
    canSubmit?: boolean;
    onSubmit: FormEventHandler<HTMLFormElement>;
    children: ReactNode;
}) {
    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (!pending) onOpenChange(o);
            }}
        >
            <SheetTrigger asChild>{trigger}</SheetTrigger>
            <SheetContent className="flex w-full flex-col sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>{title}</SheetTitle>
                    <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <form
                    noValidate
                    className="mt-5 flex min-h-0 flex-1 flex-col"
                    onSubmit={onSubmit}
                >
                    {/* The fields scroll between the title and the buttons;
                        the padding keeps a focus ring at the edge from
                        being cut off. */}
                    <div className="-mx-1 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-1 pb-1">
                        {children}
                    </div>

                    <SheetFooter className="mt-4 flex-row flex-wrap items-center gap-2 border-t border-border pt-4 sm:justify-start sm:space-x-0">
                        <Button
                            type="submit"
                            variant="brand"
                            disabled={pending || !canSubmit}
                        >
                            {pending ? busyLabel : submitLabel}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
