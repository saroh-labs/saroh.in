import type { ComponentProps, ReactNode } from "react";

import { Container } from "../layout/container";
import { SectionHeading } from "./section-heading";

/**
 * A page section with its H2 (DEC-195, A8): a `Container` named by its
 * heading, drawn by `SectionHeading` (`size="md"` by default). `className`
 * carries the section's own layout and top space.
 */
export function Section({
    id,
    titleId,
    title,
    eyebrow,
    lead,
    size = "md",
    width,
    className,
    headingClassName,
    children,
}: {
    id?: string;
    /** The H2's id, which names the section. */
    titleId: string;
    title: ReactNode;
    eyebrow?: ReactNode;
    lead?: ReactNode;
    size?: ComponentProps<typeof SectionHeading>["size"];
    width?: ComponentProps<typeof Container>["width"];
    className?: string;
    headingClassName?: string;
    children: ReactNode;
}) {
    return (
        <Container
            as="section"
            id={id}
            width={width}
            aria-labelledby={titleId}
            className={className}
        >
            <SectionHeading
                id={titleId}
                title={title}
                eyebrow={eyebrow}
                lead={lead}
                size={size}
                className={headingClassName}
            />
            {children}
        </Container>
    );
}
