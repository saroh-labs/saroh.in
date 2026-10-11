import { FailedRead } from "@/components/shared/failed-read";
import { ListFilter } from "@/components/shared/list-toolbar";
import { EmptyState } from "@saroh/ui/data-state";
import { ProgressBar } from "@saroh/ui/progress-bar";

/** The design's white card: border-first, 12px corners, 14px by 16px. */
export const CARD = "rounded-xl border border-border bg-card px-4 py-3.5";

/** A card's small label: "Usually buys", "Classes left". */
export const LABEL = "text-[12.5px] text-muted-foreground";

/** A row that opens a record: the whole card is the target. */
export const ROW_LINK =
    "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-foreground transition-colors duration-fast hover:border-border-strong active:bg-accent-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A tab whose part of the read failed: the failed card, an alert with Try
 * again. Never an empty tab, which would read as "this customer has none".
 */
export function Failed({ what }: { what: string }) {
    return (
        <FailedRead
            size="panel"
            things={what.charAt(0).toLowerCase() + what.slice(1)}
        />
    );
}

/**
 * A tab with nothing in it: the shared empty card at panel size when it has
 * a title, and one line when a sentence is all there is to say.
 */
export function Empty({
    title,
    children,
    action,
    className,
    "data-ph-mask": mask,
}: {
    title?: string;
    children: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
    /**
     * Say so where the words name the customer: a session recording then
     * masks them. Left out, they are read as Saroh's own.
     */
    "data-ph-mask"?: "";
}) {
    return title ? (
        <EmptyState
            data-ph-mask={mask}
            size="panel"
            className={className}
            title={title}
            description={children}
            action={action}
        />
    ) : (
        <EmptyState
            data-ph-mask={mask}
            size="inline"
            className={className}
            title={children}
            action={action}
        />
    );
}

/**
 * The design's filter chips ("All · 6", "Open · 1"): the chosen one is Ink,
 * the rest outlined. A group of toggle buttons, one pressed.
 */
export function Chips<K extends string>({
    label,
    chips,
    value,
    onChange,
}: {
    label: string;
    /** `count` follows the label as a quiet number; leave it out if unknown. */
    chips: { key: K; label: string; count?: number }[];
    value: K;
    onChange: (key: K) => void;
}) {
    return (
        <div className="mb-2.5">
            <ListFilter<K>
                label={label}
                value={value}
                onValueChange={onChange}
                options={chips.map((c) => ({
                    value: c.key,
                    label: c.label,
                    count: c.count,
                }))}
            />
        </div>
    );
}

/** A thin progress bar: what is left of an allowance or a pack. */
export function Bar({
    pct,
    tone,
}: {
    pct: number;
    tone: "ok" | "accent" | "off";
}) {
    return (
        <ProgressBar
            value={Math.max(0, Math.min(100, pct))}
            max={100}
            size="xs"
            tone={
                tone === "ok"
                    ? "success"
                    : tone === "accent"
                      ? "ink"
                      : "neutral"
            }
            label={`${Math.round(Math.max(0, Math.min(100, pct)))}% left`}
            className="mt-[7px]"
        />
    );
}
