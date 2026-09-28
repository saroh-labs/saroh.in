"use client";

import { Sheet, SheetContent, SheetTitle } from "@saroh/ui/sheet";

/**
 * The day as a sheet from the right: between the phone and the full rail
 * in Month (E28), and at every width in Week (E25), where the columns take
 * the page. A dialog: Tab stays inside and Esc closes it. It opens on the
 * day's title, and closing it hands focus back to what opened it rather
 * than the top of the page.
 */
export function DaySheet({
    open,
    onOpenChange,
    returnTo,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Where focus goes back to on close: the day that opened it. */
    returnTo: () => HTMLElement | null | undefined;
    /** The panel, given the sheet's own title to head it. */
    children: (heading: (title: string) => React.ReactNode) => React.ReactNode;
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-[380px] max-w-full overflow-y-auto px-[18px] py-4 sm:max-w-[380px]"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    document.getElementById("calendar-sheet-title")?.focus();
                }}
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    returnTo()?.focus();
                }}
            >
                {children((title) => (
                    <SheetTitle
                        id="calendar-sheet-title"
                        tabIndex={-1}
                        className="pr-10 font-display text-[16px] font-semibold tracking-[-0.02em] outline-none"
                    >
                        {title}
                    </SheetTitle>
                ))}
            </SheetContent>
        </Sheet>
    );
}
