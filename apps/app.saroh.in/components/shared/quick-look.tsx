"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The one sheet every quick look opens in — an invoice, a subscription, a
 * booking — after the designs' shared peek (`Saroh Invoices`,
 * `Saroh Subscriptions`, `Saroh Bookings`): 460px from the right on Paper,
 * a white header with what it is, its status and Close, the body in cards,
 * and a footer whose last action opens the full page.
 *
 * Built from the product page's quick sheet, without its form: a quick look
 * reads and links; changes happen on the record's own page. Escape, the
 * backdrop and Close all close it, and focus goes back to the row that
 * opened it (Radix returns it to the trigger).
 *
 * `side="bottom"` rises from the foot of the screen instead, at most 85% of
 * its height with rounded top corners — how a phone shows it.
 */
export function QuickLook({
    open,
    onOpenChange,
    title,
    subtitle,
    status,
    description,
    footer,
    titleClassName,
    leading,
    side = "right",
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** What it is: an invoice number, a subscriber's name. */
    title: ReactNode;
    /** The line under it: "Tax invoice · 18 Sep". */
    subtitle?: ReactNode;
    /** The status pill, beside Close. */
    status?: ReactNode;
    /** Said to a screen reader when the sheet opens. */
    description: string;
    footer?: ReactNode;
    /** The title's face: the invoice number is set in mono. */
    titleClassName?: string;
    /** Before the title: a subscriber's initials. Decorative. */
    leading?: ReactNode;
    /** Where it comes in from: the right (the default), or the bottom. */
    side?: "right" | "bottom";
    children: ReactNode;
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={side}
                closeButton={false}
                className={cn(
                    "flex w-full flex-col gap-0 bg-background p-0 focus:outline-none",
                    side === "bottom"
                        ? "max-h-[85dvh] overflow-hidden rounded-t-2xl"
                        : "sm:max-w-[460px]",
                )}
                // Focus lands on the sheet, not its first link, so nothing
                // opens already ringed; Tab moves in from there.
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.focus();
                }}
            >
                <div className="flex items-center gap-2.5 border-b border-border bg-card px-[18px] py-3.5">
                    {leading}
                    <div className="min-w-0 flex-1">
                        <SheetTitle
                            className={cn(
                                "truncate text-[15px] font-medium text-foreground",
                                titleClassName,
                            )}
                        >
                            {title}
                        </SheetTitle>
                        {subtitle ? (
                            <p className="text-[12px] text-muted-foreground">
                                {subtitle}
                            </p>
                        ) : null}
                    </div>
                    {status}
                    <SheetClose className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-muted text-muted-foreground ring-offset-background transition-colors duration-fast hover:bg-secondary-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:size-11">
                        <X aria-hidden className="size-4" strokeWidth={2} />
                        <span className="sr-only">Close</span>
                    </SheetClose>
                </div>
                <SheetDescription className="sr-only">
                    {description}
                </SheetDescription>
                <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-[18px] py-4">
                    {children}
                </div>
                {footer ? (
                    <div className="flex flex-wrap gap-2 border-t border-border bg-card px-[18px] py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                        {footer}
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

/** A white card in a quick look's body, with an eyebrow when it has one. */
export function QuickLookCard({
    label,
    className,
    children,
}: {
    label?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section
            className={cn(
                "rounded-[12px] border border-border bg-card px-4 py-[13px]",
                className,
            )}
        >
            {label ? (
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {label}
                </h3>
            ) : null}
            {children}
        </section>
    );
}
