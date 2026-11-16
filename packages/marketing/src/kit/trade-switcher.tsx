import Link from "next/link";

import { cn } from "../cn";
import { ring } from "../ring";

export interface TradeOption {
    /** The trade's key, as `?trade=` carries it ("bakery"). */
    id: string;
    label: string;
    /** Where it goes: another trade page, or this page with `?trade=`. */
    href?: string;
}

const OPTION = `inline-flex h-11 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border-none px-4 text-[15px] font-medium no-underline transition-colors duration-fast ease-out min-[760px]:px-[18px] ${ring({ offset: 1 })}`;
const OFF =
    "bg-transparent text-mk-copy hover:bg-mk-hover hover:text-foreground";
const ON =
    "bg-foreground text-background hover:bg-foreground hover:text-background";

/**
 * The trade picker (KIT.md's segmented control): "A day at a · Bakery ·
 * Salon · Gym · Florist · All trades", "Show it for a · Bakery · Salon ·
 * Gym". Links (`aria-current`) when each option has an `href`, which is how
 * `?trade=` works without script; toggle buttons (`aria-pressed`) when the
 * page passes `onSelect` from its own client code. Scrolls sideways inside
 * itself on a narrow phone, never the page.
 */
export function TradeSwitcher({
    legend,
    options,
    value,
    onSelect,
    className,
}: {
    /** The words before it: "A day at a". */
    legend: string;
    options: readonly TradeOption[];
    /** The chosen trade's `id`. */
    value: string;
    onSelect?: (id: string) => void;
    className?: string;
}) {
    return (
        <div
            role="group"
            aria-label={legend}
            className={cn("flex min-w-0 items-center gap-3", className)}
        >
            <span className="shrink-0 text-[14px] text-muted-foreground">
                {legend}
            </span>
            <div
                // Scrolls sideways on purpose when the trades outrun a phone.
                data-scroll-x=""
                className="flex min-w-0 overflow-x-auto rounded-full border border-border bg-card/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {options.map((o) => {
                    const on = o.id === value;
                    return onSelect !== undefined || !o.href ? (
                        <button
                            key={o.id}
                            type="button"
                            aria-pressed={on}
                            onClick={
                                onSelect ? () => onSelect(o.id) : undefined
                            }
                            className={cn(OPTION, on ? ON : OFF)}
                        >
                            {o.label}
                        </button>
                    ) : (
                        <Link
                            key={o.id}
                            href={o.href}
                            aria-current={on ? "page" : undefined}
                            className={cn(OPTION, on ? ON : OFF)}
                        >
                            {o.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
