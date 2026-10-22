"use client";

import type { DialogSize } from "@saroh/ui/dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactElement, ReactNode } from "react";

import type { OverlayFootProps, OverlaySubmit } from "./overlay-form";
import {
    OverlayFoot,
    OverlayProvider,
    useOverlayDirty,
    useOverlayDraft,
    useOverlayFrame,
} from "./overlay-form";

/**
 * The one dialog (UX audit, 10 Oct): one to three fields, or one choice.
 * More than that is a `FormSheet`, and a question with nothing to fill in
 * is a `ConfirmDialog`. Its rules are `overlay-form.tsx`'s, shared with
 * the sheet: the same foot, labels, saving state, ways out and focus.
 *
 * Three widths: `sm` (420px) for one field or one choice, `md` (460px,
 * the default) for two or three fields, `lg` (560px) for a choice between
 * cards or a short list.
 *
 * Pass `onSubmit` and the fields as children and it draws the rest. A
 * dialog whose draft is a component of its own leaves `onSubmit` out and
 * draws `FormDialogFoot` itself, under its fields.
 */
export function FormDialog({
    id,
    open,
    trigger,
    returnFocusTo,
    title,
    description,
    size = "md",
    pending = false,
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
    /** The button that opens it, when the dialog owns its opener. */
    trigger?: ReactElement;
    /**
     * What takes the keyboard back, for a dialog with no `trigger` and
     * more than one way in. Left out, it is whatever had it on opening.
     */
    returnFocusTo?: string | (() => HTMLElement | null | undefined);
    title: string;
    /** One sentence: what saving changes. */
    description: ReactNode;
    size?: DialogSize;
    pending?: boolean;
    /**
     * The draft differs from what it opened with. Leave it out and the
     * frame reads the fields; pass it when they can't show the work.
     * With it said, a "Save" on an unchanged draft just closes.
     */
    dirty?: boolean;
    /** The fields' own spacing. */
    fieldsClassName?: string;
    className?: string;
    /** A line above the buttons, such as what the button does not do. */
    footNote?: ReactNode;
    /** With a `trigger`: it was pressed. */
    onOpen?: () => void;
    /** Cancel, Escape, the close button, or a press outside a clean draft. */
    onClose: () => void;
    /** Leave it out to draw `FormDialogFoot` inside. */
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
        <Dialog open={open} onOpenChange={frame.onOpenChange}>
            {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
            <DialogContent
                size={size}
                className={className}
                {...frame.contentProps}
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <OverlayProvider value={frame.context}>
                    <form className="grid min-w-0" id={id} {...frame.formProps}>
                        {composed ? (
                            children
                        ) : (
                            <>
                                <div
                                    data-overlay-body
                                    className={cn(
                                        "grid min-w-0 gap-4",
                                        fieldsClassName,
                                    )}
                                >
                                    {children}
                                </div>
                                <OverlayFoot
                                    {...foot}
                                    saveLabel={saveLabel}
                                    doneOnly={doneOnly}
                                    note={footNote}
                                    className={DIALOG_FOOT}
                                />
                            </>
                        )}
                    </form>
                </OverlayProvider>
            </DialogContent>
        </Dialog>
    );
}

/** A dialog's foot has no rule above it: the dialog is short. */
const DIALOG_FOOT = "mt-5 border-t-0 pt-0";

/** The foot of a dialog that draws its own parts. */
export function FormDialogFoot(props: OverlayFootProps) {
    return (
        <OverlayFoot {...props} className={cn(DIALOG_FOOT, props.className)} />
    );
}

/** A draft under the dialog says what it holds (`useOverlayDraft`). */
export const useFormDialogDraft = useOverlayDraft;

/** The same, for a draft that already knows whether it has changed. */
export const useFormDialogDirty = useOverlayDirty;
