"use client";

import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";

import type { HomeNew } from "@/components/shared/navigation/quick-actions";

import { NEW_ROW, NewRowBody } from "./new-menu";

/**
 * Home's New on a phone (DEC-171, plan U5; boards `HPMore` "New, owner"
 * and "New, Member", `HPHome`): the + floating over the tab bar's right
 * end, on Home only, opening a bottom sheet with the same rows as the
 * desk's menu and the same role line.
 *
 * The shared sheet from the foot, styled for its board (DEC-195): it
 * traps focus, Escape and the scrim close it, and focus returns to the +
 * on the way out; focus goes to Close on opening. Each row is 54px, past the 44px a thumb needs.
 * With nothing to offer, neither the + nor the sheet is drawn.
 */
export function NewSheet({ items, roleLine }: HomeNew) {
    const [open, setOpen] = useState(false);
    const closeRef = useRef<HTMLButtonElement>(null);
    if (items.length === 0) return null;

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <button
                    type="button"
                    aria-label="New"
                    className={cn(
                        // The board's 56px rounded square, 16px in from the
                        // edge and above the tab bar (`--tab-bar-inset`).
                        "fixed bottom-[calc(var(--tab-bar-inset)+16px)] right-4 z-30 grid size-14 cursor-pointer place-items-center rounded-[18px] border-0 bg-primary text-primary-foreground",
                        "shadow-[0_8px_24px_hsl(var(--shadow-color)/0.28)] transition-colors duration-fast hover:bg-primary-hover active:bg-primary-active",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        "desk:hidden print:hidden",
                    )}
                >
                    <Plus aria-hidden className="size-6" />
                </button>
            </SheetTrigger>
            <SheetContent
                side="bottom"
                // Close is in the sheet's own header row (the board's).
                closeButton={false}
                data-ph-unmask=""
                aria-describedby={undefined}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    closeRef.current?.focus();
                }}
                // The board's sheet on the shared one: 76% tall at most, no
                // edge, its own padding and shadow.
                className="flex max-h-[76%] flex-col gap-0 overflow-hidden rounded-t-[18px] border-t-0 p-0 px-4 pt-2 shadow-[0_-10px_32px_hsl(var(--shadow-color)/0.2)] outline-none"
            >
                <span
                    aria-hidden
                    className="mb-2 h-1 w-10 shrink-0 self-center rounded-sm bg-border"
                />
                <div className="flex items-center justify-between pb-2">
                    <SheetTitle className="font-display text-lg font-semibold tracking-[-0.02em]">
                        New
                    </SheetTitle>
                    <SheetClose
                        ref={closeRef}
                        aria-label="Close"
                        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-foreground/80 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:bg-accent-active coarse:size-11"
                    >
                        <X aria-hidden className="size-[18px]" />
                    </SheetClose>
                </div>
                <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto overscroll-contain pb-[calc(12px+env(safe-area-inset-bottom))]">
                    <ul className="grid gap-0.5">
                        {items.map((item) => (
                            <li key={item.key}>
                                <IntentLink
                                    href={item.href}
                                    onClick={() => setOpen(false)}
                                    className={cn(
                                        NEW_ROW,
                                        "flex w-full items-center text-left transition-colors duration-fast hover:bg-muted active:bg-accent-active",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                                    )}
                                >
                                    <NewRowBody item={item} />
                                </IntentLink>
                            </li>
                        ))}
                    </ul>
                    {roleLine ? (
                        <p className="text-pretty px-2.5 text-xs leading-[1.45] text-muted-foreground">
                            {roleLine}
                        </p>
                    ) : null}
                </div>
            </SheetContent>
        </Sheet>
    );
}

/**
 * The room the + needs under the page's last line, so it never sits on
 * something the merchant needs to press: its 56px and its 16px gap. Drawn
 * at the very end of the page by whoever draws the + (`HomeHeader`'s
 * caller), never beside the header, where it was a gap above the work.
 */
export function NewSpace() {
    return (
        <div aria-hidden data-new-space="" className="h-[72px] desk:hidden" />
    );
}
