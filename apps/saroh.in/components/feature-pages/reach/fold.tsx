import { cn } from "@saroh/marketing/cn";
import { ring } from "@saroh/marketing/ring";
import { ChevronDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * A closed fold (PHONE.md, the indexing rule): its summary reads as a
 * TextLink with no arrow ("See the whole …"), a short meta on the right, and
 * what it opens stays in the HTML. `phone` folds it on a phone only: from
 * 760px the page shows the same words elsewhere, so the fold goes.
 */
export function Fold({
    label,
    meta,
    children,
    phone = false,
    className,
}: {
    label: ReactNode;
    meta?: ReactNode;
    children: ReactNode;
    phone?: boolean;
    className?: string;
}) {
    return (
        <details
            className={cn(
                "group mt-2",
                phone && "min-[760px]:hidden",
                className,
            )}
        >
            <summary
                className={cn(
                    "flex min-h-12 cursor-pointer list-none items-center gap-3 border-b border-border text-[16px] font-semibold text-foreground [&::-webkit-details-marker]:hidden",
                    ring(),
                )}
            >
                <span className="whitespace-nowrap underline decoration-border-strong decoration-1 underline-offset-[3px] group-hover:decoration-foreground">
                    {label}
                </span>
                {meta ? (
                    <small className="ml-auto truncate text-[13px] font-medium text-muted-foreground">
                        {meta}
                    </small>
                ) : (
                    <span className="ml-auto" />
                )}
                <ChevronDown
                    aria-hidden
                    className="size-[18px] shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
            </summary>
            <div className="pb-1.5 pt-3.5 text-[15px] leading-normal text-mk-copy [&_ul]:m-0 [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:pl-[18px]">
                {children}
            </div>
        </details>
    );
}

/**
 * A phone crop of a drawn screen that opens in place (PHONE.md: crop,
 * don't shrink). The whole screen is always in the HTML; under `until`
 * wide it is cut at `height` with a fade, and "See the whole …" (a closed
 * `<details>`) lifts the cut. From `until` the screen shows whole and the
 * fold goes.
 */
export function CropToggle({
    label,
    height,
    until = 760,
    children,
}: {
    label: string;
    height: number;
    until?: 760 | 1080;
    children: ReactNode;
}) {
    const phone = until === 760;
    return (
        <div className="group/crop min-w-0">
            <div
                style={{ "--crop": `${height}px` } as CSSProperties}
                className={cn(
                    "relative overflow-hidden rounded-mk-card",
                    phone
                        ? "max-[759px]:max-h-[var(--crop)] max-[759px]:group-has-[details[open]]/crop:max-h-none"
                        : "max-[1079px]:max-h-[var(--crop)] max-[1079px]:group-has-[details[open]]/crop:max-h-none",
                )}
            >
                {children}
                <div
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-card group-has-[details[open]]/crop:hidden",
                        phone ? "min-[760px]:hidden" : "min-[1080px]:hidden",
                    )}
                />
            </div>
            <details
                className={cn(
                    "group",
                    phone ? "min-[760px]:hidden" : "min-[1080px]:hidden",
                )}
            >
                <summary
                    className={cn(
                        "flex min-h-12 cursor-pointer list-none items-center justify-between border-b border-border text-[16px] font-semibold [&::-webkit-details-marker]:hidden",
                        ring(),
                    )}
                >
                    <span className="underline decoration-border-strong underline-offset-[3px]">
                        {label}
                    </span>
                    <ChevronDown
                        aria-hidden
                        className="size-[18px] transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                </summary>
            </details>
        </div>
    );
}
