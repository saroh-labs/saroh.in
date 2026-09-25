import { Card } from "@saroh/ui/card";
import Link from "next/link";
import type { ReactNode } from "react";

/** Small pieces the product page's Overview is built from, at the design's sizes. */

export function SectionTitle({
    title,
    aside,
    action,
}: {
    title: string;
    aside?: string;
    action?: ReactNode;
}) {
    // Title, then its Edit, then what it means — the design reads left to
    // right, so the action sits with the thing it edits, not at the far edge.
    return (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em]">
                {title}
            </h2>
            {action ? <div className="self-center">{action}</div> : null}
            {aside ? (
                <p className="text-[12px] text-muted-foreground">{aside}</p>
            ) : null}
        </div>
    );
}

/** A number the merchant checks first: label, figure, one line under it. */
export function ProductStat({
    label,
    value,
    hint,
    className,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    className?: string;
}) {
    return (
        <Card
            className={`rounded-[12px] px-[15px] py-[13px] ${className ?? ""}`}
        >
            <p className="text-[11.5px] text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-[22px] font-semibold tabular-nums leading-tight">
                {value}
            </p>
            {hint ? (
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {hint}
                </p>
            ) : null}
        </Card>
    );
}

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
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11.5px] text-muted-foreground">{title}</p>
                <Link
                    href={href}
                    className="text-[12px] text-brand hover:text-foreground"
                >
                    Open
                </Link>
            </div>
            <div className="flex flex-col gap-1 leading-[1.45]">{children}</div>
        </Card>
    );
}

export function PanelLine({
    status,
    what,
}: {
    status: "failed" | "forbidden";
    what: string;
}) {
    return status === "failed" ? (
        <p role="alert" className="text-[12px] text-destructive">
            Couldn&apos;t load {what}. Everything else on this page is current.
        </p>
    ) : (
        <p className="text-[12px] text-muted-foreground">
            Your role can&apos;t see {what}.
        </p>
    );
}
