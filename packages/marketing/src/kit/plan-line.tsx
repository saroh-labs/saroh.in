import type { ReactNode } from "react";

import { cn } from "../cn";
import { TextLink } from "../links/text-link";

/**
 * Plans in one sentence (KIT.md), in place of a three-card plan strip
 * everywhere but /pricing: "Free to start. Ask AI on Grow and Pro." then
 * "Compare plans →". The sentence is the page's; a line that names a plan
 * only shows where its claim switch is on.
 */
export function PlanLine({
    children,
    compare,
    className,
}: {
    children: ReactNode;
    compare: { label: string; href: string };
    className?: string;
}) {
    return (
        <p
            className={cn(
                "m-0 flex flex-wrap items-center gap-x-3 text-[16px] leading-normal text-mk-copy",
                className,
            )}
        >
            <span>{children}</span>
            <TextLink href={compare.href} tone="ink" arrow>
                {compare.label}
            </TextLink>
        </p>
    );
}
