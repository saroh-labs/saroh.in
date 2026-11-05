"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { SheetHandle } from "./sheet";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            "fixed inset-0 z-50 bg-[hsl(var(--shadow-color)/0.45)] duration-base ease-out data-[state=closed]:duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            className,
        )}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * On a phone the dialog is the screen's width and never wider: its one
 * column is `minmax(0, 1fr)`, so an unbreakable value (a long email) can't
 * widen it past the edge and push its buttons off, and long words break
 * rather than overflow. It is never taller than the screen either — what
 * doesn't fit scrolls inside it, so its actions stay reachable
 * (`e2e/tests/phone-reflow.spec.ts`).
 */
/**
 * On a phone (below `sm`) every dialog is a bottom sheet (DEC-202), in the
 * bottom `FormSheet`'s look: the screen's width, pinned to the foot, top
 * corners rounded, at most 92% of the screen tall, rising from the bottom
 * at a sheet's pace. The bottom border is transparent and as thick as the
 * home indicator's inset, so the sheet clears it whatever padding a caller
 * sets (`p-0` too). Only `max-sm:` classes: they come after a caller's own
 * unprefixed classes and never meet its `sm:` ones, so the desk dialog is
 * untouched and no call site needs a patch. `AlertDialogContent` wears it
 * too.
 */
export const SHEET_ON_PHONE =
    "max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[92dvh] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-[18px] max-sm:border-x-0 max-sm:border-b-[length:env(safe-area-inset-bottom)] max-sm:border-b-transparent max-sm:duration-slow max-sm:data-[state=closed]:duration-base max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=open]:slide-in-from-left-0";

/**
 * On a phone, a full-screen panel instead of a sheet: the search palette
 * (owner, 31 Oct), where a results list wants the whole screen. Clear of
 * the notch and the home indicator; no grab handle.
 */
export const FULL_ON_PHONE =
    "max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-top-0 max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-top-0";

/** The phone sheet's grab handle; it takes no room, so no caller re-pads. */
export function DialogHandle() {
    return <SheetHandle className="absolute inset-x-0 top-2 sm:hidden" />;
}

/**
 * The three widths a dialog comes in, by the size of its task: one field
 * or one choice (`sm`, 420px), two or three fields (`md`, 460px), a choice
 * between cards or a short list (`lg`, 560px). Anything bigger is a side
 * sheet. With no `size` it keeps the width it always had.
 */
const DIALOG_SIZE = {
    sm: "max-w-[420px]",
    md: "max-w-[460px]",
    lg: "max-w-[560px]",
} as const;

export type DialogSize = keyof typeof DIALOG_SIZE;

interface DialogContentProps extends React.ComponentPropsWithoutRef<
    typeof DialogPrimitive.Content
> {
    size?: DialogSize;
    /** False when nothing may close it but its own buttons. */
    closeButton?: boolean;
    /** How it opens on a phone: a bottom sheet (DEC-202), or the full screen. */
    phone?: "sheet" | "full";
}

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    DialogContentProps
>(
    (
        {
            className,
            children,
            size,
            closeButton = true,
            phone = "sheet",
            ...props
        },
        ref,
    ) => (
        <DialogPortal>
            <DialogOverlay />
            <DialogPrimitive.Content
                ref={ref}
                className={cn(
                    "fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full translate-x-[-50%] translate-y-[-50%] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto break-words border bg-card p-6 text-card-foreground shadow-lg duration-base ease-out data-[state=closed]:duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-2xl",
                    size ? DIALOG_SIZE[size] : "max-w-lg",
                    phone === "full" ? FULL_ON_PHONE : SHEET_ON_PHONE,
                    className,
                )}
                {...props}
            >
                {phone === "sheet" ? <DialogHandle /> : null}
                {children}
                {closeButton ? (
                    /* A 30px target (44 on touch), as the sheet's: never a
                   bare 16px glyph. */
                    <DialogPrimitive.Close className="absolute right-3 top-3 z-10 grid size-[30px] cursor-pointer place-items-center rounded-[7px] text-muted-foreground ring-offset-background transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active disabled:pointer-events-none coarse:size-11">
                        <X className="size-4" strokeWidth={2.1} />
                        <span className="sr-only">Close</span>
                    </DialogPrimitive.Close>
                ) : null}
            </DialogPrimitive.Content>
        </DialogPortal>
    ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                // Clear of the close button, on a phone too.
                "flex flex-col space-y-1.5 pr-8 text-left",
                className,
            )}
            {...props}
        />
    );
}
DialogHeader.displayName = "DialogHeader";

/**
 * The way out, then the dialog's own button, on the right. On a phone they
 * stack full width with the dialog's button on top, a gap between them.
 */
function DialogFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
                className,
            )}
            {...props}
        />
    );
}
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn(
            "font-display text-lg font-semibold leading-tight tracking-[-0.02em]",
            className,
        )}
        {...props}
    />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
};
