import { Button } from "@saroh/ui/button";
import { ChevronRight, Landmark } from "lucide-react";
import Link from "next/link";

import {
    CHEQUES_ACTION,
    CHEQUES_SUB,
    chequesTitle,
} from "@/lib/home/group-words";
import type { HomeChequesWaiting } from "@/lib/home/service";

/**
 * "Cheques not in the bank" in Needs you's money group, at a desk
 * (DEC-173, Home plan U18): drawn as a group's line is (`NeedGroup`), with
 * its glyph, "2 cheques not in the bank · ₹14,000", the line under it and
 * "See cheques". It has no rows to open: it goes to the invoices list
 * filtered to those cheques, where each is marked in the bank or bounced.
 */
export function DeskChequesLine({ cheques }: { cheques: HomeChequesWaiting }) {
    return (
        <li
            data-cheques-line=""
            className="border-t border-border first:border-t-0"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pl-3.5 pr-2.5">
                <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-neutral-700 dark:text-muted-foreground"
                >
                    <Landmark className="size-[18px]" />
                </span>
                <Link
                    href={cheques.href}
                    className="grid min-w-0 flex-[1_1_240px] gap-0.5 rounded text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11"
                >
                    <span className="text-[14.5px] font-semibold [overflow-wrap:anywhere]">
                        {chequesTitle(cheques)}
                    </span>
                    <span className="text-pretty text-[12.5px] leading-[1.4] text-muted-foreground">
                        {CHEQUES_SUB}
                    </span>
                </Link>
                <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                        <Link href={cheques.href}>{CHEQUES_ACTION}</Link>
                    </Button>
                </span>
            </div>
        </li>
    );
}

/**
 * The same line on a phone (plan U17's list): one line with its glyph and
 * a chevron, opening the filtered invoices list. No sheet: there is
 * nothing to do on Home but go and mark them.
 */
export function PhoneChequesLine({ cheques }: { cheques: HomeChequesWaiting }) {
    return (
        <li
            data-cheques-line=""
            className="border-t border-border first:border-t-0"
        >
            <Link
                href={cheques.href}
                className="flex min-h-[54px] w-full items-center gap-3 py-2 pl-3.5 pr-3 text-left text-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active"
            >
                <Landmark
                    aria-hidden
                    className="size-[18px] shrink-0 text-neutral-700 dark:text-muted-foreground"
                />
                <span className="min-w-0 flex-1 text-[14.5px] font-semibold [overflow-wrap:anywhere]">
                    {chequesTitle(cheques)}
                </span>
                <ChevronRight
                    aria-hidden
                    className="size-[18px] shrink-0 text-muted-foreground"
                />
            </Link>
        </li>
    );
}
