"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import type { LucideIcon } from "lucide-react";
import {
    CalendarClock,
    ChevronDown,
    FileText,
    Plus,
    Store,
} from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import type {
    HomeNew,
    HomeNewKey,
} from "@/components/shared/navigation/quick-actions";

/** The board's glyph for each start: a shop, a dated clock, a page. */
export const HOME_NEW_ICONS: Record<HomeNewKey, LucideIcon> = {
    order: Store,
    booking: CalendarClock,
    invoice: FileText,
};

/**
 * Home's New menu on a desk (DEC-171, plan U5; boards `HANewOwnerD` and
 * `HANewMemberD`): a "New" button by the greeting that opens a menu of
 * the starts this person may make, each with its second line. What the
 * business has but the role doesn't is named once under the rows.
 *
 * Each row is a link into the flow's own sheet (`?new=1` opens New order
 * and New booking where they live, the invoice opens its editor), so the
 * task is finished where it opens. With nothing to offer, nothing is
 * drawn. Below the rail's width the phone's + (`NewSheet`) takes its place.
 *
 * Radix gives the keyboard: Enter or Space opens it on the first row, the
 * arrows move, Escape closes it and focus goes back to New.
 */
export function NewMenu({ items, roleLine }: HomeNew) {
    const noteId = useId();
    if (items.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" className="max-desk:hidden">
                    <Plus aria-hidden />
                    New
                    <ChevronDown aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={8}
                // The rows are Saroh's own words; a recording may read them.
                data-ph-unmask=""
                aria-describedby={roleLine ? noteId : undefined}
                className="w-[300px] rounded-xl p-1.5 shadow-lg"
            >
                {items.map((item) => (
                    <DropdownMenuItem key={item.key} asChild>
                        <Link href={item.href} className={NEW_ROW}>
                            <NewRowBody item={item} />
                        </Link>
                    </DropdownMenuItem>
                ))}
                {roleLine ? (
                    // Not a row: there is nothing to press. Presentation, so
                    // the menu holds only its items; the menu names it as its
                    // description, so a screen reader hears it on opening.
                    <div
                        role="presentation"
                        id={noteId}
                        className="mx-2.5 mb-1.5 mt-1 text-pretty text-xs leading-[1.45] text-muted-foreground"
                    >
                        {roleLine}
                    </div>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** A row: the board's 54px, an 18px glyph in a 20px column, two lines. */
export const NEW_ROW =
    "min-h-[54px] gap-3 rounded-lg px-2.5 py-2 text-[13.5px] no-underline";

export function NewRowBody({ item }: { item: HomeNew["items"][number] }) {
    const Icon = HOME_NEW_ICONS[item.key];
    return (
        <>
            <span className="flex w-5 shrink-0 justify-center text-muted-foreground">
                <Icon aria-hidden className="size-[18px]" />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="font-semibold text-foreground">
                    {item.label}
                </span>
                <span className="text-xs text-muted-foreground">
                    {item.hint}
                </span>
            </span>
        </>
    );
}
