"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import type { FormEventHandler, ReactNode } from "react";
import { useState } from "react";

/** A problem said under the field it is about. */
export const PROBLEM =
    "text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground";

/** A note under a field. */
export const NOTE = "text-pretty text-xs text-muted-foreground";

/**
 * One row's sheet: whether it is open, which opening this is (a `key`, so
 * each opening is a fresh draft; 0 until the first), and how to open and
 * close it.
 */
export interface SheetControl {
    open: boolean;
    opened: number;
    show: () => void;
    close: () => void;
}

/** A sheet nothing outside its row opens, such as a verification code's. */
export function useSheetControl(): SheetControl {
    const [state, setState] = useState({ open: false, opened: 0 });
    return {
        ...state,
        show: () => setState((s) => ({ open: true, opened: s.opened + 1 })),
        close: () => setState((s) => ({ ...s, open: false })),
    };
}

/**
 * The frame every Edit sheet on Website › Settings shares. It is The
 * place's (`PlaceSheetFrame` in `components/stores/place-sheets.tsx`) with
 * the same classes, kept here until the two are lifted into one: the title
 * and a line under it, the fields (which scroll), and Save then Cancel at
 * the foot.
 *
 * Nothing saves until Save. Cancel, Escape, the close button and a press
 * outside drop what was typed, unasked, and the sheet can't be dismissed
 * while a save is on its way. Closed, the keyboard goes back to the row's
 * Edit (`editId`). The row gives each opening its own `key`, so a sheet
 * starts from what is saved every time.
 */
export function SettingsSheetFrame({
    editId,
    title,
    description,
    open,
    pending,
    onClose,
    onSubmit,
    wide = false,
    children,
}: {
    /** The row's Edit, which takes the keyboard back. */
    editId: string;
    title: string;
    description: ReactNode;
    open: boolean;
    pending: boolean;
    onClose: () => void;
    onSubmit: FormEventHandler<HTMLFormElement>;
    /** Room for a builder (the menu) or an editor with a toolbar. */
    wide?: boolean;
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
                className={cn(
                    "flex w-full flex-col",
                    wide ? "sm:max-w-lg" : "sm:max-w-md",
                )}
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    // Another sheet has opened in its place: the keyboard
                    // stays there.
                    if (
                        document.querySelector(
                            '[role="dialog"][data-state="open"]',
                        )
                    ) {
                        return;
                    }
                    document.getElementById(editId)?.focus();
                }}
            >
                <SheetHeader>
                    <SheetTitle>{title}</SheetTitle>
                    <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <form
                    noValidate
                    className="mt-5 flex min-h-0 flex-1 flex-col"
                    onSubmit={(e) => {
                        // The link box of the footer's editor is a form of
                        // its own, in a popover: React hands its submit up
                        // to this one, and it isn't Save.
                        if (e.target !== e.currentTarget) return;
                        onSubmit(e);
                    }}
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
                            disabled={pending}
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
