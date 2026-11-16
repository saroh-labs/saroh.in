import type { ComponentProps, ReactNode } from "react";

import { cn } from "../cn";
import { Container } from "../layout/container";
import { SectionHeading } from "./section-heading";

/**
 * A section's band (the redesign, KIT.md): the colour it fills edge to edge.
 * The hour tints (`dawn` to `lamp`) are for Solutions only; `lamp` is the
 * night's dark band, its words light. `white` is a lighter band between
 * Paper ones. `ink` is the closing band's Ink, for a section drawn dark
 * (Website's overdrive sections), its words on-Ink.
 */
export type SectionTone =
    "paper" | "white" | "dawn" | "noon" | "afternoon" | "dusk" | "lamp" | "ink";

export const TONE_BAND: Record<SectionTone, string> = {
    paper: "bg-background text-foreground",
    white: "bg-card text-foreground",
    dawn: "bg-mk-dawn text-foreground",
    noon: "bg-mk-noon text-foreground",
    afternoon: "bg-mk-afternoon text-foreground",
    dusk: "bg-mk-dusk text-foreground",
    // Its headings and copy turn light with it (`[&_h2]`, `.text-mk-copy`).
    lamp: "bg-mk-lamp text-mk-lamp-fg [&_.text-foreground]:text-mk-lamp-fg [&_.text-mk-copy]:text-mk-lamp-meta",
    // Buttons and links keep their own colours (a Saffron button stays Ink on Saffron).
    ink: "bg-foreground text-background [&_.text-foreground:not(a):not(button)]:text-background [&_.text-mk-copy]:text-mk-on-ink",
};

/**
 * A page section with its H2 (DEC-195, A8): a `Container` named by its
 * heading, drawn by `SectionHeading` (`size="md"` by default). `className`
 * carries the section's own layout and top space.
 *
 * `tone` (the redesign) draws the section on a band that runs the width of
 * the window, with the column inside it; the kit's sections take
 * `size="kit-h2"` and `space="kit"` (120px above and below on desk, 72px on
 * a phone).
 */
export function Section({
    id,
    titleId,
    title,
    eyebrow,
    lead,
    size = "md",
    width,
    tone,
    space,
    align,
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
    /** A band of its own, edge to edge (the redesign). */
    tone?: SectionTone;
    /** The kit's space above and below. */
    space?: "kit";
    align?: ComponentProps<typeof SectionHeading>["align"];
    className?: string;
    headingClassName?: string;
    children: ReactNode;
}) {
    const heading = (
        <SectionHeading
            id={titleId}
            title={title}
            eyebrow={eyebrow}
            lead={lead}
            size={size}
            align={align}
            className={headingClassName}
        />
    );
    const pad = space === "kit" && "py-[72px] min-[760px]:py-[120px]";
    if (!tone) {
        return (
            <Container
                as="section"
                id={id}
                width={width}
                aria-labelledby={titleId}
                className={cn(pad, className)}
            >
                {heading}
                {children}
            </Container>
        );
    }
    return (
        <section id={id} aria-labelledby={titleId} className={TONE_BAND[tone]}>
            <Container width={width} className={cn(pad, className)}>
                {heading}
                {children}
            </Container>
        </section>
    );
}
