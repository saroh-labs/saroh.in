"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "../../lib/utils";

/**
 * The shadcn Drawer (vaul underneath): the one phone bottom sheet that can
 * be dragged down and keeps its actions pinned. Vaul is imported here only;
 * app code uses these pieces.
 */
function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
    return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
    React.ElementRef<typeof DrawerPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DrawerPrimitive.Overlay
        ref={ref}
        className={cn(
            "fixed inset-0 z-50 bg-[hsl(var(--shadow-color)/0.45)] print:hidden",
            className,
        )}
        {...props}
    />
));
DrawerOverlay.displayName = "DrawerOverlay";

/**
 * The sheet: rounded on top with a grab handle. `overlay={false}` leaves the
 * page undimmed and in reach (use with `modal={false}` on the root).
 */
const DrawerContent = React.forwardRef<
    React.ElementRef<typeof DrawerPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
        overlay?: boolean;
    }
>(({ className, children, overlay = true, ...props }, ref) => (
    <DrawerPortal>
        {overlay ? <DrawerOverlay /> : null}
        <DrawerPrimitive.Content
            ref={ref}
            data-slot="drawer-content"
            className={cn(
                "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[85dvh] flex-col rounded-t-[18px] border border-b-0 bg-card text-card-foreground shadow-lg outline-none",
                className,
            )}
            {...props}
        >
            <div
                aria-hidden
                className="mx-auto mb-1 mt-2 h-[5px] w-10 shrink-0 rounded-full bg-border"
            />
            {children}
        </DrawerPrimitive.Content>
    </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

function DrawerHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex shrink-0 flex-col gap-0.5 border-b px-4 pb-2.5 pt-1 text-left",
                className,
            )}
            {...props}
        />
    );
}

/** Pinned under the body; the main action on top, full width. */
function DrawerFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex shrink-0 flex-col gap-2 border-t bg-card px-4 pb-5 pt-3",
                className,
            )}
            {...props}
        />
    );
}

const DrawerTitle = React.forwardRef<
    React.ElementRef<typeof DrawerPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DrawerPrimitive.Title
        ref={ref}
        className={cn(
            "text-[1.0625rem] font-semibold leading-tight text-foreground",
            className,
        )}
        {...props}
    />
));
DrawerTitle.displayName = "DrawerTitle";

const DrawerDescription = React.forwardRef<
    React.ElementRef<typeof DrawerPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DrawerPrimitive.Description
        ref={ref}
        className={cn("text-xs text-muted-foreground", className)}
        {...props}
    />
));
DrawerDescription.displayName = "DrawerDescription";

export {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerOverlay,
    DrawerPortal,
    DrawerTitle,
    DrawerTrigger,
};
