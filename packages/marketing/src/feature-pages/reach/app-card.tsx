import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../cn";

/**
 * A crop of a Saroh screen (the boards' `.ac`): the business's initial and
 * name, the screen's place ("Sell / Products"), then the rows that make the
 * point at full size. Saroh's own UI, so Saroh's type and colours.
 */
export function AppCard({
    business,
    place,
    page,
    children,
    className,
}: {
    business: string;
    place?: string;
    page: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "min-w-0 overflow-hidden rounded-[14px] border border-border bg-card",
                className,
            )}
        >
            <div className="flex h-[46px] items-center gap-2.5 border-b border-mk-line-row bg-mk-noon px-4 text-[14px]">
                <span className="inline-flex items-center gap-[7px] font-semibold">
                    <i
                        aria-hidden
                        className="inline-flex size-[22px] items-center justify-center rounded-md bg-foreground text-[12px] font-bold not-italic text-background"
                    >
                        {business.charAt(0)}
                    </i>
                    {business}
                </span>
                <span className="truncate text-muted-foreground">
                    {place ? `${place} / ` : ""}
                    <b className="font-semibold text-foreground">{page}</b>
                </span>
            </div>
            {children}
        </div>
    );
}

/** One row of an AppCard: a thumbnail, the name and its note, then the end. */
export function AppRow({
    thumb,
    name,
    note,
    end,
    highlight = false,
    className,
}: {
    thumb?: ReactNode;
    name: ReactNode;
    note?: ReactNode;
    end?: ReactNode;
    highlight?: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-3 border-t border-mk-line-row px-4 py-[11px] text-[14.5px] first-of-type:border-t-0",
                highlight && "bg-mk-tint",
                className,
            )}
        >
            {thumb}
            <span className="min-w-0 flex-1 leading-snug">
                {name}
                {note ? (
                    <small className="block text-[13px] text-muted-foreground">
                        {note}
                    </small>
                ) : null}
            </span>
            {end}
        </div>
    );
}

/** The green "Live" pill a published record carries. */
export function LivePill({
    children,
    dot = false,
    className,
}: {
    children: ReactNode;
    dot?: boolean;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-mk-ok-tint px-2.5 text-[12.5px] font-semibold text-mk-ok",
                className,
            )}
        >
            {dot ? (
                <span
                    aria-hidden
                    className="size-[7px] rounded-full bg-current"
                />
            ) : null}
            {children}
        </span>
    );
}

/** A draft's pill: Saffron's text shade on its tint. */
export function DraftPill({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-mk-tint px-2.5 text-[12.5px] font-semibold text-brand-700">
            {children}
        </span>
    );
}

/**
 * The dashed "goes to" between a Saroh screen and where it shows (`.arr`):
 * across on desk, down on a phone.
 */
export function FlowArrow({
    label,
    on = "paper",
    className,
}: {
    label: ReactNode;
    /** The fill it sits on, so its label masks the line. */
    on?: "paper" | "white";
    className?: string;
}) {
    return (
        <div
            aria-hidden
            className={cn(
                "relative flex h-14 items-center justify-center min-[1080px]:h-[60px]",
                className,
            )}
        >
            <span className="absolute inset-y-1 left-1/2 border-l-[1.5px] border-dashed border-border-strong min-[1080px]:inset-x-[18px] min-[1080px]:inset-y-auto min-[1080px]:left-2.5 min-[1080px]:top-1/2 min-[1080px]:border-l-0 min-[1080px]:border-t-[1.5px]" />
            <span
                className={cn(
                    "relative px-2.5",
                    on === "white" ? "bg-card" : "bg-background",
                )}
            >
                <span className="py-1 text-[13.5px] font-semibold text-mk-copy">
                    {label}
                </span>
            </span>
            <ArrowRight className="absolute bottom-0 left-1/2 size-5 -translate-x-1/2 rotate-90 text-muted-foreground min-[1080px]:bottom-auto min-[1080px]:left-auto min-[1080px]:right-2 min-[1080px]:top-1/2 min-[1080px]:-translate-y-1/2 min-[1080px]:translate-x-0 min-[1080px]:rotate-0" />
        </div>
    );
}

/** A time label in a paper chip ("Tue 7 am"), mono, as the boards' `.ts`. */
export function TimeChip({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex h-8 shrink-0 items-center rounded-lg bg-mk-hover px-2.5 font-mono text-[14px] font-medium text-foreground">
            {children}
        </span>
    );
}
