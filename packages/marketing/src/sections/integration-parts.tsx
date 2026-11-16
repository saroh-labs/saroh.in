import type { ReactNode } from "react";

import { Container } from "../layout/container";
import { Pill } from "../links/pill";

/** An integration card's head: its name, its kind under it, the "Available" pill. */
export function IntegrationCardHead({
    name,
    kind,
    available,
}: {
    name: string;
    kind: string;
    available: string;
}) {
    return (
        <span className="flex items-start gap-3">
            <span className="grid">
                <span className="font-display text-mk-kit-h3 font-bold">
                    {name}
                </span>
                <span className="text-[13px] text-muted-foreground">
                    {kind}
                </span>
            </span>
            <Pill tone="ok" className="ml-auto">
                {available}
            </Pill>
        </span>
    );
}

/** /integrations' "Planned" section: its heading, its line and the list. */
export function PlannedSection({
    id,
    title,
    intro,
    children,
}: {
    id?: string;
    title: string;
    intro: string;
    children: ReactNode;
}) {
    return (
        <Container
            as="section"
            aria-labelledby="planned"
            id={id}
            className="grid gap-5 pt-[72px] min-[760px]:pt-[120px]"
        >
            <h2
                id="planned"
                className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
            >
                {title}
            </h2>
            <p className="m-0 mb-3 max-w-[70ch] text-[16px] leading-[1.6] text-mk-copy">
                {intro}
            </p>
            {children}
        </Container>
    );
}
