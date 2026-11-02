import Link from "next/link";
import type { ComponentProps } from "react";

const CARD =
    "flex flex-col gap-2.5 rounded-card border border-line bg-surface p-6";

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
            className={`${CARD} no-underline transition-colors duration-150 hover:border-strong ${className}`}
            {...props}
        >
            <span className="font-display text-[21px] font-bold tracking-[-0.03em]">
                {title}
            </span>
            <span className="text-[15.5px] leading-normal text-body">
                {line}
            </span>
        </Link>
    );
}
