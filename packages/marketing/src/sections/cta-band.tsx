import type { ReactNode } from "react";

import { cn } from "../cn";
import { Container } from "../layout/container";

/**
 * The dark band every page closes with: the page's own title, the body, then
 * the site's buttons (`actions`) and the line under them. With neither of
 * those, the words alone, no empty column.
 */
export function CtaBand({
    title,
    body,
    actions,
    note,
    className,
}: {
    title: string;
    body: string;
    /** The site's start button, and whatever sits beside it. */
    actions?: ReactNode;
    /** The line under the buttons. */
    note?: string | null;
    /** The space above, where a design draws it other than 110px. */
    className?: string;
}) {
    return (
        <Container className={cn("pt-[110px]", className)}>
            <div className="flex flex-wrap items-end justify-between gap-10 rounded-mk-band bg-foreground p-mk-band text-background">
                <div className="grid flex-[1_1_420px] gap-4">
                    <h2 className="m-0 font-display text-mk-band font-bold [text-wrap:balance]">
                        {title}
                    </h2>
                    <p className="m-0 max-w-[46ch] text-mk-band-body text-mk-on-ink [text-wrap:pretty]">
                        {body}
                    </p>
                </div>
                {actions || note ? (
                    <div className="grid justify-items-start gap-3">
                        {actions}
                        {note ? (
                            <span className="text-mk-note text-mk-on-ink-muted">
                                {note}
                            </span>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </Container>
    );
}
