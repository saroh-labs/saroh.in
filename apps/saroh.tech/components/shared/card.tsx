import { cardLinkClasses } from "@saroh/marketing/card-link";
import Link from "next/link";
import type { ComponentProps } from "react";

const CARD =
    "flex flex-col gap-2.5 rounded-mk-card border border-border bg-card p-6";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
    return <div className={`${CARD} ${className}`} {...props} />;
}

/** A whole card that goes somewhere. */
export function LinkCard({
    title,
    line,
    className = "",
    ...props
}: Omit<ComponentProps<typeof Link>, "title"> & {
    title: string;
    line: string;
}) {
    return (
        <Link
            prefetch={false}
            className={cardLinkClasses(`gap-2 p-[22px] ${className}`)}
            {...props}
        >
            <span className="font-display text-mk-card font-bold">{title}</span>
            <span className="text-mk-card-body text-mk-copy [text-wrap:pretty]">
                {line}
            </span>
        </Link>
    );
}
