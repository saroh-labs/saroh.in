"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import type { ReactElement, ReactNode } from "react";

import type { OverlayFootProps, OverlaySubmit } from "./overlay-form";
import {
    OverlayBody,
    OverlayFoot,
    OverlayProvider,
    useOverlayDirty,
    useOverlayDraft,
    useOverlayFrame,
} from "./overlay-form";

/**
 * The one side sheet (UX audit, 10 Oct). Anything with more than three
 * fields is edited or made in it: a settings row, an order's change, a
 * note, a new booking. Its rules are `overlay-form.tsx`'s, shared with
 * `FormDialog`.
 *
 * Two widths and no others: the screen on a phone and 448px beside the
 * page, or 512px with `wide` for a builder or a list of lines. The title
 * and one sentence under it stay put, the fields scroll, and the foot is
 * pinned with a rule above it: the way out, then the sheet's own button,
 * on the right (stacked on a phone, the button on top).
 *
 * Pass `onSubmit` and the fields as children and it draws the rest. A
 * sheet whose draft is a component of its own (so each opening starts
 * fresh, as Order Detail's are) leaves `onSubmit` out and draws
 * `FormSheetBody` and `FormSheetFoot` itself, inside.
 *
 * Never write a `SheetContent` and a footer by hand for something that
 * saves: `overlay-frames.test.ts` reads the app and fails a copy.
 */
export function FormSheet({
    id,
    open,
    trigger,
    returnFocusTo,
    eyebrow,
    title,
    description,
    pending = false,
    wide = false,
    dirty,
    fieldsClassName,
    className,
    footNote,
    onOpen,
    onClose,
    onSubmit,
    children,
    saveLabel = "Save",
    doneOnly,
    ...foot
}: {
    /** The form's id. */
    id?: string;
    open: boolean;
    /** The button that opens it, when the sheet owns its opener. */
    trigger?: ReactElement;
    /**
     * What takes the keyboard back, for a sheet with no `trigger` and
     * more than one way in. Left out, it is whatever had it on opening.
     */
    returnFocusTo?: string | (() => HTMLElement | null | undefined);
    /** A quiet line over the title: whose sheet this is (a product). */
    eyebrow?: ReactNode;
    title: string;
    /** One sentence: what saving changes. */
    description: ReactNode;
    pending?: boolean;
    /** Room for a builder (the menu) or a list of lines with prices. */
    wide?: boolean;
    /**
     * The draft differs from what it opened with. Leave it out and the
     * frame reads the fields; pass it when they can't show the work.
     * With it said, a "Save" on an unchanged draft just closes.
     */
    dirty?: boolean;
    /** The fields' own spacing, where a sheet's groups need more room. */
    fieldsClassName?: string;
    className?: string;
    /** A line above the buttons, such as what the button does not do. */
    footNote?: ReactNode;
    /** With a `trigger`: it was pressed. */
    onOpen?: () => void;
    /** Cancel, Escape, the close button, or a press outside a clean draft. */
    onClose: () => void;
    /** Leave it out to draw `FormSheetBody` and `FormSheetFoot` inside. */
    onSubmit?: OverlaySubmit;
    children: ReactNode;
} & Omit<OverlayFootProps, "note" | "onSubmit" | "pending" | "className">) {
    const composed = !onSubmit && !doneOnly;
    const frame = useOverlayFrame({
        open,
        pending,
        dirty,
        hasTrigger: Boolean(trigger),
        returnFocusTo,
        closesUnchanged: !composed && saveLabel === "Save",
        onOpen,
        onClose,
        onSubmit,
    });
    return (
        <Sheet open={open} onOpenChange={frame.onOpenChange}>
            {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
            <SheetContent
                className={cn(
                    // Off the paper: a page printed with a sheet open
                    // prints the page.
                    "flex w-full flex-col gap-0 print:hidden",
                    wide ? "sm:max-w-lg" : "sm:max-w-md",
                    className,
                )}
                {...frame.contentProps}
            >
                <SheetHeader>
                    {eyebrow ? (
                        <p className="text-[11.5px] text-muted-foreground">
                            {eyebrow}
                        </p>
                    ) : null}
                    <SheetTitle>{title}</SheetTitle>
                    <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <OverlayProvider value={frame.context}>
                    <form
                        id={id}
                        className="mt-5 flex min-h-0 flex-1 flex-col"
                        {...frame.formProps}
                    >
                        {composed ? (
                            children
                        ) : (
                            <>
                                <OverlayBody className={fieldsClassName}>
                                    {children}
                                </OverlayBody>
                                <OverlayFoot
                                    {...foot}
                                    saveLabel={saveLabel}
                                    doneOnly={doneOnly}
                                    note={footNote}
                                />
                            </>
                        )}
                    </form>
                </OverlayProvider>
            </SheetContent>
        </Sheet>
    );
}

/** The scrolling fields of a sheet that draws its own parts. */
export const FormSheetBody = OverlayBody;

/** The pinned foot of a sheet that draws its own parts. */
export const FormSheetFoot = OverlayFoot;

/** A draft under the sheet says what it holds (`useOverlayDraft`). */
export const useFormSheetDraft = useOverlayDraft;

/** The same, for a draft that already knows whether it has changed. */
export const useFormSheetDirty = useOverlayDirty;
