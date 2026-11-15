import type { ReactNode } from "react";

import { cn } from "../cn";
import { Container } from "../layout/container";

/**
 * A page's last word (KIT.md): one heading, the primary "Start free" and a
 * secondary by page type (a feature page links its trade-day moment, a trade
 * page its template). Both buttons come from the site (`cta()`), so the
 * launch switch moves them. `note` is "Free to start. No card needed." only
 * where the hero hasn't said it.
 */
export function ClosingCTA({
    id = "start",
    title,
    primary,
    secondary,
    note,
    className,
}: {
    id?: string;
    title: ReactNode;
    primary: ReactNode;
    secondary?: ReactNode;
    note?: ReactNode;
    className?: string;
}) {
    return (
        <Container
            as="section"
            aria-labelledby={`${id}-title`}
            className={cn(
                "grid justify-items-center gap-7 py-[72px] text-center min-[760px]:py-[96px]",
                className,
            )}
        >
            <h2
                id={`${id}-title`}
                className="m-0 max-w-[22ch] font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
            >
                {title}
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
                {primary}
                {secondary}
            </div>
            {note ? (
                <p className="m-0 text-[15px] text-muted-foreground">{note}</p>
            ) : null}
        </Container>
    );
}
