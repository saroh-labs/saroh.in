import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const SIZE = {
    /** A feature page's "What it does": 16.5px titles, 280px columns. */
    md: {
        grid: "gap-x-10 gap-y-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]",
        title: "text-[16.5px] font-semibold",
        body: "text-mk-card-body text-mk-copy [text-wrap:pretty]",
    },
    /** The link preview tool's notes: 16px titles, 260px columns. */
    sm: {
        grid: "grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-8",
        title: "text-base font-semibold",
        body: "text-[14.5px] leading-[1.55] text-mk-copy",
    },
} as const;

/**
 * Points, each a title and a line under a hairline, as many columns as fit
 * (DEC-195, A21). `titleAs="h2"` where each point is a heading of the page.
 */
export function PointGrid({
    points,
    size = "md",
    titleAs: Title = "span",
    className,
}: {
    points: readonly { title: string; body: ReactNode }[];
    size?: keyof typeof SIZE;
    titleAs?: "span" | "h2";
    className?: string;
}) {
    const s = SIZE[size];
    return (
        <ul className={cn("m-0 grid list-none p-0", s.grid, className)}>
            {points.map((point) => (
                <li
                    key={point.title}
                    className="grid content-start gap-1.5 border-t border-border pt-4"
                >
                    <Title className={cn("m-0", s.title)}>{point.title}</Title>
                    <p className={cn("m-0", s.body)}>{point.body}</p>
                </li>
            ))}
        </ul>
    );
}
