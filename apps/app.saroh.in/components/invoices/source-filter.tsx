import Link from "next/link";

import { Chip } from "@/components/shared/chip";
import type { SourceChip } from "@/lib/invoices/sources";

/**
 * What the Invoices list is narrowed to by what each paper was for (D18).
 *
 * The chips: All, then each source the business has — Orders, Bookings,
 * Subscriptions, Packs, Courses, By hand. A radio group, as every chip row
 * is (`Chip`): one choice at a time.
 */
export function SourceChips({
    chips,
    chosen,
    onPick,
}: {
    chips: readonly { id: SourceChip; label: string }[];
    chosen: SourceChip;
    onPick: (chip: SourceChip) => void;
}) {
    if (chips.length === 0) return null;
    return (
        <div
            role="radiogroup"
            aria-label="What it was for"
            className="mb-3 flex flex-wrap gap-2"
        >
            {chips.map((c) => (
                <Chip
                    key={c.id}
                    on={c.id === chosen}
                    onClick={() => onPick(c.id)}
                >
                    {c.label}
                </Chip>
            ))}
        </div>
    );
}

/**
 * The design's pill for one pack's or course's invoices ("Showing 3 for
 * Morning pack") and "Show all invoices" beside it. It says the list is
 * narrowed, not only narrows it.
 */
export function ScopeNotice({
    line,
    clearHref,
}: {
    line: string;
    clearHref: string;
}) {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <span
                role="status"
                className="inline-flex h-8 items-center gap-2 rounded-full bg-brand-subtle px-3 text-[13px] font-semibold text-brand-subtle-foreground"
            >
                {line}
            </span>
            <Link
                href={clearHref}
                className="rounded-sm text-[13px] font-semibold text-brand underline-offset-4 transition-opacity duration-fast hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-70 coarse:inline-flex coarse:min-h-11 coarse:items-center"
            >
                Show all invoices
            </Link>
        </div>
    );
}
