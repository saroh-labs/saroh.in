import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { LegalText } from "@/components/legal/legal-text";
import { LEGAL_PAGES, isLive } from "@/content/resources";
import { formatDay } from "@/lib/format/day";
import { parseLegal } from "@/lib/legal-markdown";
import { resourcesContext } from "@/lib/resources-context";
import { Container } from "../shared/layout/container";
import { PageTitle } from "../shared/sections/page-title";

/**
 * A legal page (plan U1, R6): the owner's text, verbatim, in a 720px reading
 * column. Served from its `publishOn` day in India (`LEGAL_PAGES`); before
 * that it is a 404 and is linked nowhere (KTD-2). "Last updated" is that day.
 */
export function LegalPage({
    id,
    title,
    body,
}: {
    id: string;
    title: string;
    body: string;
}) {
    const page = LEGAL_PAGES.find((p) => p.id === id);
    if (!page || !isLive(page, resourcesContext())) notFound();
    return (
        <LegalFrame title={title}>
            <p className="m-0 text-[14px] text-muted-foreground">
                Last updated{" "}
                <time dateTime={page.publishOn}>
                    {formatDay(page.publishOn, { month: "long", year: true })}
                </time>
            </p>
            <LegalText blocks={parseLegal(body)} />
        </LegalFrame>
    );
}

/**
 * The legal pages' reading column and title, which /customers shares
 * (DEC-195, A23).
 */
export function LegalFrame({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <Container
            as="article"
            width="article"
            className="grid gap-5 pt-[72px]"
        >
            <PageTitle size="article">{title}</PageTitle>
            {children}
        </Container>
    );
}
