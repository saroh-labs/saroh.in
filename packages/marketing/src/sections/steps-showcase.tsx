"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useId, useRef, useState } from "react";

import { cn } from "../cn";
import { Container } from "../layout/container";
import { LinkRow } from "../links/text-link";
import { ring } from "../ring";
import { nextIndex } from "../roving";
import { SectionHeading } from "./section-heading";

export interface ShowcaseStep {
    title: string;
    body: string;
    /** The step's picture: a captured shot or a drawing. */
    picture: ReactNode;
    /** A small line under the picture: the demo business it is shown at. */
    note?: string;
}

/** Where the panel's pictures sit on a desk: the right 7 of 12, after the 64px gap. */
const DESK_PANEL =
    "min-[1080px]:absolute min-[1080px]:right-0 min-[1080px]:top-0 min-[1080px]:h-[640px] min-[1080px]:w-[calc((100%_-_64px)*7/12)]";

/**
 * "How it works" as numbered steps beside one large panel (board "Steps A",
 * #42, #49, #51): on a desk the list sits left (5 of 12) and the panel right
 * (7 of 12) shows the picked step's picture; the others are dimmed. On a
 * phone every step shows its own picture under it. Every picture is in the
 * HTML from the server (the phone SEO rule: nothing loads on tap); on a desk
 * the ones not picked are hidden by CSS. Steps are toggle buttons
 * (`aria-pressed`); the arrow keys move along them and pick.
 */
export function StepsShowcase({
    steps,
    foot,
    links = [],
    ...head
}: StepsSectionProps & { steps: readonly ShowcaseStep[] }) {
    const [at, setAt] = useState(0);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const base = useId();

    const onKey = (e: KeyboardEvent, i: number) => {
        const to = nextIndex(e.key, i, steps.length);
        if (to === null) return;
        e.preventDefault();
        setAt(to);
        buttons.current[to]?.focus();
    };

    return (
        <StepsSection
            {...head}
            // The panel's pictures are placed against this box on a desk.
            relative
            aside={
                // Holds the panel's place in the grid on a desk.
                <div
                    aria-hidden
                    className="hidden h-[640px] min-[1080px]:block"
                />
            }
        >
            <ol className="m-0 list-none border-t border-border p-0">
                {steps.map((step, i) => {
                    const on = i === at;
                    const pic = `${base}-${i}`;
                    return (
                        <li key={step.title} className="border-b border-border">
                            <button
                                ref={(el) => {
                                    buttons.current[i] = el;
                                }}
                                type="button"
                                aria-pressed={on}
                                aria-controls={pic}
                                tabIndex={on ? 0 : -1}
                                onClick={() => setAt(i)}
                                onKeyDown={(e) => onKey(e, i)}
                                className={cn(
                                    "flex w-full cursor-pointer items-start gap-4 border-none bg-transparent px-1 py-[18px] text-left text-foreground transition-opacity duration-fast ease-out motion-reduce:transition-none",
                                    !on &&
                                        "min-[1080px]:opacity-75 min-[1080px]:hover:opacity-90",
                                    ring({ offset: 2 }),
                                )}
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "grid size-[30px] shrink-0 place-items-center rounded-full font-mono text-[14px] font-semibold",
                                        on
                                            ? "bg-foreground text-background"
                                            : "bg-mk-hover text-mk-copy",
                                    )}
                                >
                                    {i + 1}
                                </span>
                                <span className="grid gap-1">
                                    <span className="font-display text-[19px] font-bold leading-tight tracking-[-0.02em]">
                                        <span className="sr-only">
                                            Step {i + 1}:{" "}
                                        </span>
                                        {step.title}
                                    </span>
                                    <span className="text-[15px] leading-normal text-mk-copy [text-wrap:pretty]">
                                        {step.body}
                                    </span>
                                </span>
                            </button>
                            {/* Under its step on a phone; in the panel, when picked, on a desk. */}
                            <div
                                id={pic}
                                data-step-picture={i}
                                className={cn(
                                    "justify-[safe_center] mb-6 flex flex-col items-center gap-3 overflow-hidden rounded-mk-card border border-border bg-mk-noon p-3.5 shadow-[0_24px_48px_-24px_rgba(40,30,15,0.25)] min-[1080px]:mb-0 min-[1080px]:p-6",
                                    DESK_PANEL,
                                    !on && "min-[1080px]:hidden",
                                    on &&
                                        "motion-reduce:animate-none min-[1080px]:duration-200 min-[1080px]:animate-in min-[1080px]:fade-in",
                                )}
                            >
                                <div className="w-full min-w-0">
                                    {step.picture}
                                </div>
                                {step.note ? (
                                    <p className="m-0 self-start text-[13px] text-muted-foreground">
                                        {step.note}
                                    </p>
                                ) : null}
                            </div>
                        </li>
                    );
                })}
            </ol>
            <StepsFoot foot={foot} links={links} />
        </StepsSection>
    );
}

/** What every steps section takes besides its steps (Showcase and Player). */
export interface StepsSectionProps {
    id: string;
    title: ReactNode;
    lede?: ReactNode;
    /** One small line under the list, e.g. how long history is kept. */
    foot?: ReactNode;
    /** "How to …" links to Help. */
    links?: readonly { href: string; label: string }[];
    className?: string;
}

/**
 * A steps section's frame (Showcase and Player): the heading and the list
 * (`children`) in the left 5 of 12 on a desk, `aside` in the right 7.
 */
export function StepsSection({
    id,
    title,
    lede,
    className,
    relative = false,
    aside,
    children,
}: Pick<StepsSectionProps, "id" | "title" | "lede" | "className"> & {
    /** The grid is what the panel's pictures are placed against. */
    relative?: boolean;
    aside: ReactNode;
    children: ReactNode;
}) {
    const titleId = `${id}-title`;
    return (
        <Container
            as="section"
            id={id}
            aria-labelledby={titleId}
            className={cn("pt-12 min-[760px]:pt-[120px]", className)}
        >
            <div
                className={cn(
                    relative && "relative",
                    "grid gap-10 min-[1080px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[1080px]:items-start min-[1080px]:gap-16",
                )}
            >
                <div className="grid gap-7">
                    <SectionHeading
                        id={titleId}
                        title={title}
                        lead={lede}
                        size="kit-h2"
                    />
                    {children}
                </div>
                {aside}
            </div>
        </Container>
    );
}

/** The small line and Help links under a steps list (Showcase and Player). */
export function StepsFoot({
    foot,
    links = [],
}: {
    foot?: ReactNode;
    links?: readonly { href: string; label: string }[];
}) {
    if (!foot && !links.length) return null;
    return (
        <div className="grid gap-1 text-[14px] text-muted-foreground">
            {foot ? (
                <p className="m-0 max-w-[62ch] [text-wrap:pretty]">{foot}</p>
            ) : null}
            {links.length ? (
                <LinkRow links={links} linkClassName="text-[14px]" />
            ) : null}
        </div>
    );
}
