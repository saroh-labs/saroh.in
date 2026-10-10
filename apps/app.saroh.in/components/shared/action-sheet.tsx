"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";

/**
 * The side sheet a read-first screen opens to add something: the page shows
 * what is there, one button opens this, and the form inside keeps its
 * primary button and Cancel pinned at the foot (`ActionSheetFooter`).
 *
 * The caller owns the `Sheet` and its `SheetTrigger`, so closing puts the
 * keyboard back on the button that opened it. The form goes in as children,
 * laid out with `ACTION_SHEET_FORM` and `ACTION_SHEET_BODY`.
 *
 * While something is typed (`dirty`) a press outside the sheet doesn't
 * close it: a stray tap must not throw a half-written note away. Cancel,
 * the close button and Escape still do, each a deliberate act.
 *
 * A sheet opened from more than one button has no single trigger; it says
 * where the keyboard goes back to with `onCloseAutoFocus`. `className`
 * widens it where a list of lines needs the room.
 */
export function ActionSheetContent({
    title,
    description,
    dirty = false,
    className,
    onCloseAutoFocus,
    children,
}: {
    title: string;
    description: React.ReactNode;
    /** Something is typed and not saved. */
    dirty?: boolean;
    className?: string;
    onCloseAutoFocus?: (event: Event) => void;
    children: React.ReactNode;
}) {
    return (
        <SheetContent
            className={cn("flex w-full flex-col sm:max-w-md", className)}
            onCloseAutoFocus={onCloseAutoFocus}
            onInteractOutside={(event) => {
                if (dirty) event.preventDefault();
            }}
        >
            <SheetHeader className="pr-8 text-left">
                <SheetTitle>{title}</SheetTitle>
                <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            {children}
        </SheetContent>
    );
}

/** The form fills the sheet under its header, so the footer sits at the foot. */
export const ACTION_SHEET_FORM = "flex min-h-0 flex-1 flex-col";

/** The fields scroll; the inset keeps a focus ring from being clipped. */
export const ACTION_SHEET_BODY =
    "-mx-1 grid flex-1 content-start gap-4 overflow-y-auto px-1 py-1";

/**
 * Cancel, then the sheet's own button (a submit inside the form). On a
 * phone they stack with the primary on top.
 */
export function ActionSheetFooter({
    busy = false,
    cancel = "Cancel",
    children,
}: {
    /** The action is running: Cancel waits for it. */
    busy?: boolean;
    cancel?: string;
    children?: React.ReactNode;
}) {
    return (
        <SheetFooter className="mt-4 gap-2 sm:space-x-0">
            <SheetClose asChild>
                <Button type="button" variant="outline" disabled={busy}>
                    {cancel}
                </Button>
            </SheetClose>
            {children}
        </SheetFooter>
    );
}
