"use client";

import { ChevronRight, Clock, Eye, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { Face } from "./face";

/**
 * A row that opens a sheet (More's rows, Booking rules): an icon, its name,
 * a word of what it holds on the right ("1 coming up", "Preview"), and a
 * chevron.
 */
export function MoreRow({
    icon,
    label,
    value,
    onOpen,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    onOpen: () => void;
}) {
    return (
        <li className="border-b border-border last:border-b-0">
            <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`${label}, ${value}`}
                onClick={onOpen}
                className="flex min-h-[54px] w-full cursor-pointer items-center gap-3 bg-card pl-3.5 pr-3 text-left text-[15px] font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring min-[760px]:min-h-[58px] min-[760px]:px-[18px] min-[760px]:text-[14.5px] min-[760px]:font-semibold"
            >
                <Face icon={icon} />
                <span className="min-w-0 flex-1">{label}</span>
                <span className="whitespace-nowrap text-[13.5px] font-normal text-muted-foreground min-[760px]:text-[12.5px]">
                    {value}
                </span>
                <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
            </button>
        </li>
    );
}

export const RULES_ICON = (
    <SlidersHorizontal aria-hidden className="size-[17px]" />
);

/** The business's Booking rules, as one row. */
export function RulesRow({ onOpen }: { onOpen: () => void }) {
    return (
        <ul className="overflow-hidden rounded-[14px] border border-border bg-card min-[760px]:rounded-[12px]">
            <MoreRow
                icon={RULES_ICON}
                label="Booking rules"
                value="Whole business"
                onOpen={onOpen}
            />
        </ul>
    );
}

/**
 * More (U17, BKMAvailability, BKDHours): Extra opening hours, What
 * customers see, and the business's Booking rules, each a row that opens
 * its own sheet.
 */
export function MoreSection({
    extraLine,
    onExtra,
    onSee,
    onRules,
}: {
    /** "1 coming up", or "None". */
    extraLine: string;
    onExtra: () => void;
    onSee: () => void;
    onRules: () => void;
}) {
    return (
        <section aria-labelledby="hours-more" className="min-w-0">
            <h2
                id="hours-more"
                className="mb-2.5 mt-[26px] font-display text-[16px] font-semibold tracking-[-0.01em] min-[760px]:mt-0 min-[760px]:text-[17px] min-[760px]:tracking-[-0.02em]"
            >
                More
            </h2>
            <ul className="overflow-hidden rounded-[14px] border border-border bg-card min-[760px]:rounded-[12px]">
                <MoreRow
                    icon={<Clock aria-hidden className="size-[17px]" />}
                    label="Extra opening hours"
                    value={extraLine}
                    onOpen={onExtra}
                />
                <MoreRow
                    icon={<Eye aria-hidden className="size-[17px]" />}
                    label="What customers see"
                    value="Preview"
                    onOpen={onSee}
                />
                <MoreRow
                    icon={RULES_ICON}
                    label="Booking rules"
                    value="Whole business"
                    onOpen={onRules}
                />
            </ul>
        </section>
    );
}
