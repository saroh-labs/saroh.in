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
    SheetTrigger,
} from "@saroh/ui/sheet";
import type { FormEventHandler, ReactElement, ReactNode } from "react";

import { draftWatch, useDraftChanged } from "./use-draft-changed";

/**
 * The one frame every settings-style Edit sheet shares (owner, 10 Oct):
 * the title and a line under it, the fields (which scroll), and the
 * sheet's button then Cancel at the foot. A location's tabs, Settings ›
 * Business, Website › Settings, Product settings and Availability's time
 * off all draw it, so how a sheet closes is one rule in one place.
 *
 * Nothing saves until the sheet's button. Cancel, Escape and the close
 * button close it and drop what was typed, unasked. A press outside does
 * the same only while nothing has changed: once the draft differs from
 * what the sheet opened with, a press outside does nothing, because a
 * stray tap must not throw typed work away. Nothing closes while a save
 * is on its way.
 *
 * Whether the draft has changed is read from the fields themselves
 * (`useDraftChanged`), so a sheet says nothing; one whose work the fields
 * can't show passes `dirty`.
 *
 * Closed, the keyboard goes back to what opened it: the `trigger` when the
 * sheet has one, else `returnFocusTo`, unless another sheet has opened in
 * its place. The opener gives each opening its own `key`, or starts a
 * fresh draft itself, so a sheet starts from what is saved every time.
 */
export function SettingsSheetFrame({
    id,
    returnFocusTo,
    trigger,
    title,
    description,
    open,
    pending,
    saveOff = false,
    saveLabel = "Save",
    savingLabel = "Saving…",
    wide = false,
    fieldsClassName,
    footNote,
    dirty,
    onOpen,
    onClose,
    onSubmit,
    children,
}: {
    /** The form's id. */
    id?: string;
    /**
     * What takes the keyboard back: the id of the row's Edit, or a way to
     * find it. Not needed with a `trigger`.
     */
    returnFocusTo?: string | (() => HTMLElement | null | undefined);
    /** The button that opens it, when the sheet owns its opener. */
    trigger?: ReactElement;
    title: string;
    description: ReactNode;
    open: boolean;
    pending: boolean;
    /** The button waits on something in the sheet, such as an upload. */
    saveOff?: boolean;
    saveLabel?: string;
    savingLabel?: string;
    /** Room for a builder (the menu) or an editor with a toolbar. */
    wide?: boolean;
    /** The fields' own spacing, where a sheet's groups need more room. */
    fieldsClassName?: string;
    /** A line above the buttons, such as what the button does not do. */
    footNote?: ReactNode;
    /**
     * The draft differs from what it opened with. Leave it out and the
     * frame reads the fields; pass it when they can't show the work.
     */
    dirty?: boolean;
    /** With a `trigger`: it was pressed. */
    onOpen?: () => void;
    onClose: () => void;
    onSubmit: FormEventHandler<HTMLFormElement>;
    children: ReactNode;
}) {
    const { attach, touch, changed } = useDraftChanged();
    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (pending) return;
                if (o) onOpen?.();
                else onClose();
            }}
        >
            {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
            <SheetContent
                className={cn(
                    "flex w-full flex-col",
                    wide ? "sm:max-w-lg" : "sm:max-w-md",
                )}
                onInteractOutside={(e) => {
                    // A stray tap must not throw typed work away.
                    if (pending || (dirty ?? changed())) {
                        e.preventDefault();
                    }
                }}
                {...(trigger
                    ? {}
                    : {
                          onCloseAutoFocus: (e: Event) => {
                              e.preventDefault();
                              // One sheet's save can open the next: the
                              // keyboard stays in that sheet.
                              if (
                                  document.querySelector(
                                      '[role="dialog"][data-state="open"]',
                                  )
                              ) {
                                  return;
                              }
                              (typeof returnFocusTo === "string"
                                  ? document.getElementById(returnFocusTo)
                                  : returnFocusTo?.()
                              )?.focus();
                          },
                      })}
            >
                <SheetHeader>
                    <SheetTitle>{title}</SheetTitle>
                    <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <form
                    ref={attach}
                    {...draftWatch(touch)}
                    id={id}
                    noValidate
                    className="mt-5 flex min-h-0 flex-1 flex-col"
                    onSubmit={(e) => {
                        // A form of its own inside a field (the link box of
                        // the footer's editor, in a popover) hands its
                        // submit up to this one, and it isn't Save.
                        if (e.target !== e.currentTarget) return;
                        onSubmit(e);
                    }}
                >
                    {/* The fields scroll between the title and the
                        buttons; the padding keeps a focus ring at the
                        edge from being cut off. */}
                    <div
                        className={cn(
                            "-mx-1 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-1 pb-1",
                            fieldsClassName,
                        )}
                    >
                        {children}
                    </div>

                    <SheetFooter
                        className={cn(
                            "mt-4 border-t border-border pt-4 sm:space-x-0",
                            footNote
                                ? "flex-col items-stretch gap-3 sm:flex-col"
                                : "flex-row flex-wrap items-center gap-2 sm:justify-start",
                        )}
                    >
                        {footNote}
                        <Buttons
                            wrapped={Boolean(footNote)}
                            pending={pending}
                            saveOff={saveOff}
                            saveLabel={saveLabel}
                            savingLabel={savingLabel}
                            onClose={onClose}
                        />
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}

/** The sheet's button, then Cancel. In a row of their own under a note. */
function Buttons({
    wrapped,
    pending,
    saveOff,
    saveLabel,
    savingLabel,
    onClose,
}: {
    wrapped: boolean;
    pending: boolean;
    saveOff: boolean;
    saveLabel: string;
    savingLabel: string;
    onClose: () => void;
}) {
    const buttons = (
        <>
            <Button type="submit" variant="brand" disabled={pending || saveOff}>
                {pending ? savingLabel : saveLabel}
            </Button>
            <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={onClose}
            >
                Cancel
            </Button>
        </>
    );
    return wrapped ? (
        <div className="flex flex-wrap items-center gap-2">{buttons}</div>
    ) : (
        buttons
    );
}
