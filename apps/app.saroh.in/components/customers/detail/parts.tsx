import { cn } from "@saroh/ui/lib/utils";

import { Pill } from "@/components/subscriptions/pill";
import type { Tone } from "@/lib/customer-workspace/view";

/** The design's white card: border-first, 12px corners, 14px by 16px. */
export const CARD = "rounded-xl border border-border bg-card px-4 py-3.5";

/** A card's small label: "Usually buys", "Classes left". */
export const LABEL = "text-[12.5px] text-muted-foreground";

/** A row that opens a record: the whole card is the target. */
export const ROW_LINK =
    "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-foreground transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A state pill in a row: sentence case, as the design draws them. */
export function RowPill({
    tone,
    children,
}: {
    tone: Tone;
    children: React.ReactNode;
}) {
    return (
        <Pill
            tone={tone}
            className="text-[11.5px] normal-case leading-[1.4] tracking-normal"
        >
            {children}
        </Pill>
    );
}

/** The dashed empty state: a title and a line, or just a line. */
export function Empty({
    title,
    children,
    className,
}: {
    title?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-xl border border-dashed border-border-strong text-center",
                title ? "px-[22px] py-[34px]" : "px-5 py-[30px]",
                className,
            )}
        >
            {title ? (
                <div className="font-display text-[17px] font-semibold">
                    {title}
                </div>
            ) : null}
            <div
                className={cn(
                    "text-pretty text-[13px] leading-[1.55] text-muted-foreground",
                    title && "mx-auto mt-1.5 max-w-[46ch]",
                )}
            >
                {children}
            </div>
        </div>
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
    height = 30,
}: {
    label: string;
    chips: { key: K; label: string }[];
    value: K;
    onChange: (key: K) => void;
    height?: 30 | 32;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="mb-2.5 flex flex-wrap gap-1.5"
        >
            {chips.map((c) => {
                const on = c.key === value;
                return (
                    <button
                        key={c.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(c.key)}
                        className={cn(
                            "rounded-full border px-3 text-[12.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11",
                            height === 30 ? "h-[30px]" : "h-8",
                            on
                                ? "border-primary bg-primary font-semibold text-primary-foreground"
                                : "border-border bg-card font-medium text-foreground/75 hover:bg-muted",
                        )}
                    >
                        {c.label}
                    </button>
                );
            })}
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
        <div className="mt-[7px] h-[5px] overflow-hidden rounded-full bg-muted">
            <div
                className={cn(
                    "h-full rounded-full",
                    tone === "ok"
                        ? "bg-success-subtle-foreground"
                        : tone === "accent"
                          ? "bg-highlight"
                          : "bg-neutral-400",
                )}
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            />
        </div>
    );
}
