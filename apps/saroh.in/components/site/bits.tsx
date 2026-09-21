import { cn } from "@saroh/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { WAITLIST_HREF } from "@/lib/links";
import type { ShotRow } from "@/lib/site-content";

/** Small pieces every page uses, in the design's measurements. */

export const eyebrow =
    "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

export const sectionHeading =
    "font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.035em]";

export const body =
    "text-pretty text-[16px] leading-[1.6] text-neutral-600 dark:text-neutral-400";

/** A full-bleed tinted band behind a section, as the design's `om-band`. */
export const band =
    "relative isolate before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:border-y before:border-border before:bg-muted/60";

export function WaitlistButton({ className }: { className?: string }) {
    return (
        <Link
            href={WAITLIST_HREF}
            className={cn(
                "inline-flex h-[47px] items-center rounded-[10px] bg-primary px-[21px] text-[16px] font-semibold text-primary-foreground transition-opacity hover:opacity-90",
                className,
            )}
        >
            Join the waitlist
        </Link>
    );
}

export function SecondaryButton({
    href,
    children,
    className,
}: {
    href: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "inline-flex h-[47px] items-center rounded-[10px] border border-border bg-card px-[18px] text-[16px] font-semibold text-foreground transition-colors hover:bg-muted",
                className,
            )}
        >
            {children}
        </Link>
    );
}

export function Pill({
    tone,
    className,
    children,
}: {
    tone?: "good" | "warn" | "off" | "ink";
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <span
            className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                tone === "good" &&
                    "bg-success-subtle text-success-subtle-foreground",
                tone === "warn" &&
                    "bg-brand-subtle text-brand-subtle-foreground",
                tone === "off" && "bg-muted text-muted-foreground",
                tone === "ink" && "bg-neutral-700 text-neutral-100",
                !tone && "bg-muted text-neutral-600 dark:text-neutral-300",
                className,
            )}
        >
            {children}
        </span>
    );
}

/**
 * A chain of steps with arrows between — "what in one place buys you", and
 * each job's "How it connects". Stacks below 900px, as the design does.
 */
export function Chain({
    steps,
    detail = false,
    className,
    stepClassName,
    style,
}: {
    steps: { owner: string; step: string; detail?: string }[];
    detail?: boolean;
    className?: string;
    stepClassName?: (index: number) => string;
    style?: (index: number) => React.CSSProperties;
}) {
    return (
        <ol className={cn("flex flex-col min-[900px]:flex-row", className)}>
            {steps.map((s, i) => (
                <li
                    key={`${s.owner}-${s.step}`}
                    className={cn(
                        "flex flex-col items-stretch min-[900px]:min-w-[150px] min-[900px]:flex-1 min-[900px]:flex-row",
                        !detail && "min-[900px]:min-w-[118px]",
                    )}
                >
                    {i > 0 ? (
                        <span
                            aria-hidden
                            className="ml-5 flex items-center py-[3px] text-muted-foreground min-[900px]:ml-0 min-[900px]:px-0.5 min-[900px]:py-0"
                        >
                            <ArrowRight className="size-[15px] rotate-90 min-[900px]:rotate-0" />
                        </span>
                    ) : null}
                    <div
                        className={cn(
                            "min-w-0 flex-auto rounded-[12px] border border-border bg-muted/60",
                            detail
                                ? "px-[15px] py-[13px]"
                                : "px-[13px] py-[11px]",
                            stepClassName?.(i),
                        )}
                        style={style?.(i)}
                    >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground min-[900px]:min-h-[26px]">
                            {s.owner}
                        </div>
                        <div className="mt-1 text-pretty text-[13px] font-semibold">
                            {s.step}
                        </div>
                        {detail && s.detail ? (
                            <div className="mt-[5px] text-pretty text-[16px] leading-[1.5] text-neutral-600 dark:text-neutral-400">
                                {s.detail}
                            </div>
                        ) : null}
                    </div>
                </li>
            ))}
        </ol>
    );
}

/** The design's drawn stand-in for a screen: a small table with a label. */
export function ExampleTable({
    crumb,
    route,
    colMain,
    colSide,
    rows,
}: {
    crumb: string;
    route: string;
    colMain: string;
    colSide: string;
    rows: ShotRow[];
}) {
    return (
        <figure className="overflow-hidden rounded-[16px] border border-border bg-background shadow-[0_16px_40px_rgba(28,28,26,0.10)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
                <span className="text-[12px] text-muted-foreground">
                    {crumb}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                    {route}
                </span>
                <Pill tone="off" className="ml-auto">
                    Example
                </Pill>
            </div>
            <div className="relative bg-card px-[17px] py-4">
                <div className="flex items-center gap-3 border-b border-border pb-2.5">
                    <span
                        className={cn(
                            eyebrow,
                            "min-w-0 flex-1 tracking-[0.08em]",
                        )}
                    >
                        {colMain}
                    </span>
                    <span
                        className={cn(
                            eyebrow,
                            "w-24 text-right tracking-[0.08em]",
                        )}
                    >
                        {colSide}
                    </span>
                </div>
                <table className="w-full">
                    <caption className="sr-only">
                        {colMain}, example rows
                    </caption>
                    <tbody>
                        {rows.map((r) => (
                            <tr
                                key={r.title}
                                className="border-b border-border/70 last:border-b-0"
                            >
                                <td className="py-[11px] pr-3 align-middle">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span
                                            className={cn(
                                                "text-[13px] font-medium",
                                                r.mono && "font-mono",
                                            )}
                                        >
                                            {r.title}
                                        </span>
                                        {r.tag ? (
                                            <Pill tone={r.tone}>{r.tag}</Pill>
                                        ) : null}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                                        {r.sub}
                                    </div>
                                </td>
                                <td className="w-24 py-[11px] text-right align-middle font-display text-[13px] font-semibold tabular-nums tracking-[-0.02em]">
                                    {r.side}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </figure>
    );
}
