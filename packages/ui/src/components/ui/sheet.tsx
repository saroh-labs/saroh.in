"use client";

import * as SheetPrimitive from "@radix-ui/react-dialog";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
    React.ElementRef<typeof SheetPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <SheetPrimitive.Overlay
        className={cn(
            "fixed inset-0 z-50 bg-[hsl(var(--shadow-color)/0.45)] duration-base ease-out data-[state=closed]:duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            className,
        )}
        {...props}
        ref={ref}
    />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
    "fixed z-50 gap-4 bg-card text-card-foreground p-6 shadow-lg transition ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-base data-[state=open]:duration-slow",
    {
        variants: {
            side: {
                top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
                bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
                right: "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
            },
        },
        defaultVariants: {
            side: "right",
        },
    },
);

interface SheetContentProps
    extends
        React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
        VariantProps<typeof sheetVariants> {
    /**
     * False when the sheet draws its own close button in its header — a
     * quick look puts it beside the status, where the design has it.
     */
    closeButton?: boolean;
}

const SheetContent = React.forwardRef<
    React.ElementRef<typeof SheetPrimitive.Content>,
    SheetContentProps
>(
    (
        {
            side = "right",
            className,
            children,
            closeButton = true,
            onInteractOutside,
            ...props
        },
        ref,
    ) => (
        <SheetPortal>
            <SheetOverlay />
            <SheetPrimitive.Content
                ref={ref}
                className={cn(sheetVariants({ side }), className)}
                {...props}
                // A toast is not "outside": Undo on "Stopped selling" is
                // pressed while the quick look that did it is still open, and
                // pressing it must not close the sheet it is about.
                onInteractOutside={(event) => {
                    onInteractOutside?.(event);
                    const target = event.target as Element | null;
                    if (target?.closest("[data-sonner-toaster]")) {
                        event.preventDefault();
                    }
                }}
            >
                {children}
                {closeButton ? (
                    /* A 30px target (44 on touch), not a bare 16px glyph:
                       closing a sheet is the most common thing done in one. */
                    <SheetPrimitive.Close className="absolute right-3 top-3 z-10 grid size-[30px] place-items-center rounded-[7px] text-muted-foreground ring-offset-background transition-colors duration-fast hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none coarse:size-11">
                        <X className="size-4" strokeWidth={2.1} />
                        <span className="sr-only">Close</span>
                    </SheetPrimitive.Close>
                ) : null}
            </SheetPrimitive.Content>
        </SheetPortal>
    ),
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

function SheetHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex flex-col space-y-2 text-center sm:text-left",
                className,
            )}
            {...props}
        />
    );
}
SheetHeader.displayName = "SheetHeader";

function SheetFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
                className,
            )}
            {...props}
        />
    );
}
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
    React.ElementRef<typeof SheetPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
    <SheetPrimitive.Title
        ref={ref}
        className={cn("text-lg font-semibold text-foreground", className)}
        {...props}
    />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
    React.ElementRef<typeof SheetPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
    <SheetPrimitive.Description
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetOverlay,
    SheetPortal,
    SheetTitle,
    SheetTrigger,
};
