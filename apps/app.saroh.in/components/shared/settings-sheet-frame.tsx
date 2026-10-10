"use client";

import { Button } from "@saroh/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import type { FormEventHandler, ReactNode } from "react";

/**
 * The frame every settings row's Edit sheet shares (owner, 10 Oct): the
 * title and a line under it, the fields (which scroll), and Save then
 * Cancel at the foot. A location's tabs and Settings › Business draw it.
 *
 * Nothing saves until Save. Cancel, Escape, the close button and a press
 * outside drop what was typed, unasked, and the sheet can't be dismissed
 * while a save is on its way. Closed, the keyboard goes back to the row's
 * Edit (`returnFocusTo`), unless another sheet has opened in its place. The
 * row gives each opening its own `key`, so a sheet starts from what is
 * saved every time.
 */
export function SettingsSheetFrame({
    id,
    returnFocusTo,
    title,
    description,
    open,
    pending,
    saveOff = false,
    onClose,
    onSubmit,
    children,
}: {
    /** The form's id. */
    id: string;
    /** The id of the row's Edit, which takes the keyboard back. */
    returnFocusTo: string;
    title: string;
    description: string;
    open: boolean;
    pending: boolean;
    /** Save waits on something in the sheet, such as an upload. */
    saveOff?: boolean;
    onClose: () => void;
    onSubmit: FormEventHandler<HTMLFormElement>;
    children: ReactNode;
}) {
    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (!o && !pending) onClose();
            }}
        >
            <SheetContent
                className="flex w-full flex-col sm:max-w-md"
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    // One sheet's save can open the next: the keyboard
                    // stays in that sheet.
                    if (
                        document.querySelector(
                            '[role="dialog"][data-state="open"]',
                        )
                    ) {
                        return;
                    }
                    document.getElementById(returnFocusTo)?.focus();
                }}
            >
                <SheetHeader>
                    <SheetTitle>{title}</SheetTitle>
                    <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <form
                    id={id}
                    noValidate
                    className="mt-5 flex min-h-0 flex-1 flex-col"
                    onSubmit={onSubmit}
                >
                    {/* The fields scroll between the title and the
                        buttons; the padding keeps a focus ring at the
                        edge from being cut off. */}
                    <div className="-mx-1 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-1 pb-1">
                        {children}
                    </div>

                    <SheetFooter className="mt-4 flex-row flex-wrap items-center gap-2 border-t border-border pt-4 sm:justify-start sm:space-x-0">
                        <Button
                            type="submit"
                            variant="brand"
                            disabled={pending || saveOff}
                        >
                            {pending ? "Saving…" : "Save"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
