import type { ReactNode } from "react";

import { cn } from "../cn";
import { TextLink } from "../links/text-link";
import { TimeStamp } from "./time-stamp";

/**
 * "Seen in a day" on a feature page (KIT.md): ONE moment, never a strip.
 * The time, one line, and a link to that hour on the trade page
 * ("See 9 am at Rye & Co. →", `/for/home-bakers#9am`). The words and the
 * anchor come from the page's world.
 */
export function MomentCard({
    at,
    line,
    link,
    className,
}: {
    /** "HH:MM", 24-hour. */
    at: string;
    line: ReactNode;
    link: { label: string; href: string };
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid items-center gap-3 rounded-mk-card border border-border bg-card px-5 py-5 min-[760px]:grid-cols-[auto_1fr_auto] min-[760px]:gap-6 min-[760px]:px-7 min-[760px]:py-6",
                className,
            )}
        >
            <TimeStamp
                at={at}
                className="w-fit rounded-lg bg-background px-2.5 py-1.5 text-[13px] text-brand-700"
            />
            <p className="m-0 text-[17px] leading-normal text-mk-copy [text-wrap:pretty]">
                {line}
            </p>
            <TextLink href={link.href} tone="ink" arrow className="text-[15px]">
                {link.label}
            </TextLink>
        </div>
    );
}
