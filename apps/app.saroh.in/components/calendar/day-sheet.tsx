"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@saroh/ui/sheet";

import { usePhone } from "@/components/bookings/calendar/header/use-phone";

/**
 * The day as a sheet: from the right between the phone and the full rail
 * in Month (E28), and at every width in Week (E25), where the columns take
 * the page. With `bottomOnPhone` (the Calendar month, bookings U13) it
 * rises from the foot of a phone instead, its `footer` — "Book on this
 * day" — pinned under the list (BKMOverviewMonth). A dialog: Tab stays
 * inside and Esc closes it. It opens on the day's title, and closing it
 * hands focus back to what opened it rather than the top of the page.
 */
export function DaySheet({
    open,
    onOpenChange,
    returnTo,
    bottomOnPhone = false,
    footer,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Where focus goes back to on close: the day that opened it. */
    returnTo: () => HTMLElement | null | undefined;
    /** Rise from the foot of a phone rather than come in from the right. */
    bottomOnPhone?: boolean;
    /** Pinned under the list on a phone's sheet: the day's actions. */
    footer?: React.ReactNode;
    /** The panel, given the sheet's own title to head it. */
    children: (heading: (title: string) => React.ReactNode) => React.ReactNode;
}) {
    const phone = usePhone();
    const bottom = bottomOnPhone && phone;
    const focus = {
        onOpenAutoFocus: (e: Event) => {
            e.preventDefault();
            document.getElementById("calendar-sheet-title")?.focus();
        },
        onCloseAutoFocus: (e: Event) => {
            e.preventDefault();
            returnTo()?.focus();
        },
    };
    const title = (text: string) => (
        <SheetTitle
            id="calendar-sheet-title"
            tabIndex={-1}
            className={cn(
                "pr-10 font-display font-semibold tracking-[-0.02em] outline-none",
                bottom ? "text-[18px] leading-tight" : "text-[16px]",
            )}
        >
            {text}
        </SheetTitle>
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {bottom ? (
                <SheetContent
                    side="bottom"
                    data-day-sheet="bottom"
                    aria-describedby={undefined}
                    className="flex max-h-[calc(100dvh-40px)] flex-col gap-0 rounded-t-[18px] border-0 bg-card p-0 shadow-xl"
                    {...focus}
                >
                    <span
                        aria-hidden
                        className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-border"
                    />
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3">
                        {children(title)}
                    </div>
                    {footer ? (
                        <div className="shrink-0 border-t border-border px-5 pb-[22px] pt-3">
                            {footer}
                        </div>
                    ) : null}
                </SheetContent>
            ) : (
                <SheetContent
                    side="right"
                    aria-describedby={undefined}
                    className="w-[380px] max-w-full overflow-y-auto px-[18px] py-4 sm:max-w-[380px]"
                    {...focus}
                >
                    {children(title)}
                </SheetContent>
            )}
        </Sheet>
    );
}
