import { buttonClasses } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A page's last word in the redesign (saroh.in's DESIGN.md, ClosingCTA): one
 * h2, the 48px Start free and the note under it. Replaces the Ink `CtaBand`
 * on the pages without a board of their own.
 */
export function Closing({
    id,
    title,
    href,
    from = "start-free-band",
    action = "Start free",
    note,
    secondary,
    inset = false,
}: {
    id: string;
    title: ReactNode;
    /** The start link (`signupHref(src)`), or a tool's page. */
    href: string;
    /** What PostHog calls this click. */
    from?: string;
    action?: string;
    note?: ReactNode;
    secondary?: ReactNode;
    /** Inside a column that already has its gutter and spacing. */
    inset?: boolean;
}) {
    return (
        <ClosingCTA
            id={id}
            className={cn(
                inset ? "rounded-mk-band" : "mt-[72px] min-[760px]:mt-[120px]",
            )}
            title={title}
            primary={
                <Link
                    prefetch={false}
                    href={href}
                    data-cta={from}
                    className={buttonClasses({ size: "kit" })}
                >
                    {action}
                </Link>
            }
            secondary={secondary}
            note={note}
        />
    );
}
