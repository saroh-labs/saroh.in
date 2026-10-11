import { ListFilter } from "@/components/shared/list-toolbar";
import type { SourceChip } from "@/lib/invoices/sources";
import { TextLink } from "@saroh/ui/text-link";

/**
 * What the Invoices list is narrowed to by what each paper was for (D18):
 * every kind, then each source the business has (Orders, Bookings,
 * Subscriptions, Packs, Courses, By hand): one of the list toolbar's
 * dropdown filters, beside the invoice's status.
 */
export function SourceFilter({
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
        <ListFilter<SourceChip>
            label="What it was for"
            value={chosen}
            onValueChange={onPick}
            options={chips.map((c) => ({
                value: c.id,
                label: c.id === "all" ? "All sources" : c.label,
            }))}
        />
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
        <div className="flex flex-wrap items-center gap-2.5">
            <span
                role="status"
                className="inline-flex h-8 items-center gap-2 rounded-full bg-muted px-3 text-[13px] font-semibold text-foreground"
            >
                {line}
            </span>
            <TextLink
                href={clearHref}
                className="text-[13px] transition-opacity duration-fast coarse:inline-flex coarse:min-h-11 coarse:items-center"
            >
                Show all invoices
            </TextLink>
        </div>
    );
}
