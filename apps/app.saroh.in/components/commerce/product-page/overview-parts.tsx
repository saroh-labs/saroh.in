import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

import type { DetailTag } from "@/lib/products/overview-words";

/** Small pieces the product page's Overview is built from, at the design's sizes. */

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** A card's heading row: 15px title, then its Edit and any link. */
export function CardHead({
    title,
    children,
}: {
    title: string;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 px-[18px] pb-2.5 pt-3.5">
            <h2 className="flex-1 font-display text-[15px] font-semibold tracking-[-0.015em]">
                {title}
            </h2>
            {children}
        </div>
    );
}

/** A number the merchant checks first: label, figure, one line under it. */
export function ProductStat({
    label,
    value,
    hint,
    children,
    className,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <Card className={cn("rounded-[12px] px-[15px] py-[13px]", className)}>
            <p className="text-[11.5px] text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-[22px] font-semibold tabular-nums leading-tight">
                {value}
            </p>
            {hint ? (
                <p className="mt-0.5 text-pretty text-[11.5px] text-muted-foreground">
                    {hint}
                </p>
            ) : null}
            {children}
        </Card>
    );
}

/** One thing linked to the product, with "Open" to its tab. */
export function LinkedCard({
    title,
    href,
    children,
}: {
    title: string;
    href: string;
    children: ReactNode;
}) {
    return (
        <Card className="flex min-w-0 flex-col gap-[7px] rounded-[12px] px-[15px] py-[13px]">
            <div className="flex items-baseline gap-2">
                <p className="flex-1 text-[11.5px] text-muted-foreground">
                    {title}
                </p>
                <Link
                    href={href}
                    scroll={false}
                    aria-label={`Open ${title.toLowerCase()}`}
                    className={cn(
                        FOCUS,
                        "rounded-sm text-[12px] text-brand hover:text-foreground coarse:min-h-11",
                    )}
                >
                    Open
                </Link>
            </div>
            {children}
        </Card>
    );
}

/** A linked card that is one tap target as a whole (Reviews). */
export function LinkedCardLink({
    title,
    href,
    children,
}: {
    title: string;
    href: string;
    children: ReactNode;
}) {
    return (
        <Link
            href={href}
            scroll={false}
            className={cn(
                FOCUS,
                "flex min-w-0 flex-col gap-[7px] rounded-[12px] border border-border bg-card px-[15px] py-[13px] text-left transition-colors hover:border-border-strong",
            )}
        >
            <span className="flex items-baseline gap-2">
                <span className="flex-1 text-[11.5px] text-muted-foreground">
                    {title}
                </span>
                <span className="text-[12px] text-brand">Open</span>
            </span>
            {children}
        </Link>
    );
}

/** The card's headline: "3 open · 41 in September". */
export function LinkedHeadline({ children }: { children: ReactNode }) {
    return <p className="text-pretty text-[14px] font-semibold">{children}</p>;
}

/** The lines under it. */
export function LinkedLines({ lines }: { lines: readonly string[] }) {
    return (
        <div className="flex flex-col gap-1 text-[12px] leading-[1.45] text-muted-foreground">
            {lines.map((l, i) => (
                <span key={i}>{l}</span>
            ))}
        </div>
    );
}

/** A panel that didn't arrive, or that this role may not see. */
export function PanelLine({
    status,
    what,
    retryHref,
}: {
    status: "failed" | "forbidden";
    what: string;
    retryHref?: string;
}) {
    return status === "failed" ? (
        <>
            <p
                role="alert"
                className="text-pretty text-[12.5px] leading-[1.5] text-destructive-subtle-foreground"
            >
                Couldn&apos;t load {what}. Everything else on this page is
                current.
            </p>
            {retryHref ? (
                <Link
                    href={retryHref}
                    scroll={false}
                    className={cn(
                        FOCUS,
                        "inline-flex h-8 items-center self-start rounded-lg border border-border bg-card px-3 text-[12px] font-semibold hover:bg-muted coarse:min-h-11",
                    )}
                >
                    Try again
                </Link>
            ) : null}
        </>
    ) : (
        <p className="text-[12px] text-muted-foreground">
            Your role can&apos;t see {what}.
        </p>
    );
}

/** On the shop · Team only · Hidden until filled in. */
export function ShownTag({ tag }: { tag: DetailTag }) {
    if (tag === "Hidden until filled in") {
        return (
            <Badge
                variant="tag"
                className="shrink-0 whitespace-nowrap rounded-full border-dashed px-[7px] py-px text-[11px] font-semibold text-muted-foreground"
            >
                {tag}
            </Badge>
        );
    }
    return (
        <Badge
            variant={tag === "On the shop" ? "success" : "neutral"}
            className="shrink-0 whitespace-nowrap rounded-full px-[7px] py-px text-[11px] font-semibold"
        >
            {tag}
        </Badge>
    );
}

/** A label, a value and — for what a customer could see — its tag. */
export function DetailRow({
    label,
    tag,
    muted,
    mono,
    children,
}: {
    label: string;
    tag?: DetailTag | null;
    muted?: boolean;
    mono?: boolean;
    children: ReactNode;
}) {
    return (
        // On a phone the tag drops under the value rather than squeezing it.
        <div className="flex items-baseline gap-3 border-t border-border py-[11px] max-sm:flex-wrap max-sm:gap-y-1">
            <dt className="w-[104px] shrink-0 text-[12.5px] text-muted-foreground">
                {label}
            </dt>
            <dd
                className={cn(
                    "min-w-0 flex-1 text-pretty break-words text-[13.5px] max-sm:min-w-[calc(100%-116px)]",
                    muted && "text-muted-foreground",
                    mono && "break-all font-mono text-[12.5px]",
                )}
            >
                {children}
            </dd>
            {tag ? (
                <span className="shrink-0 max-sm:ml-[116px]">
                    <ShownTag tag={tag} />
                </span>
            ) : null}
        </div>
    );
}
