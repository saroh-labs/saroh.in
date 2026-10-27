import type { ReactNode } from "react";

import { Container } from "../layout/container";

/**
 * A page section with its H2 (DEC-195, A8): a `Container` named by its
 * heading. `className` carries the section's own layout and top space.
 */
export function Section({
    id,
    titleId,
    title,
    className,
    children,
}: {
    id?: string;
    /** The H2's id, which names the section. */
    titleId: string;
    title: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Container
            as="section"
            id={id}
            aria-labelledby={titleId}
            className={className}
        >
            <h2
                id={titleId}
                className="m-0 font-display text-mk-h2-sm font-bold"
            >
                {title}
            </h2>
            {children}
        </Container>
    );
}
