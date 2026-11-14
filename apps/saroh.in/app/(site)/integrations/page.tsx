import Link from "next/link";

import { ComingList } from "@/components/shared/sections/coming-list";
import type { LiveIntegration } from "@/content/integrations";
import {
    INTEGRATIONS_PATH,
    integrationsIndex as page,
    plannedIntegrations,
    shownIntegrations,
} from "@/content/integrations";
import { featuresOff } from "@/lib/feature-switches";
import { pageMetadata } from "@/lib/seo";
import { Arrow } from "@saroh/marketing/arrow";
import { cardLinkClasses } from "@saroh/marketing/card-link";
import { cn } from "@saroh/marketing/cn";
import { Container } from "@saroh/marketing/container";
import { Eyebrow } from "@saroh/marketing/eyebrow";
import { PageTitle } from "@saroh/marketing/page-title";
import { Pill } from "@saroh/marketing/pill";
import { textLinkClasses } from "@saroh/marketing/text-link";

/**
 * Integrations (Resources plan U3, design "Saroh Resources - Integrations"):
 * what connects today as cards, each one link to its page, then what is
 * planned as dashed rows that never link (R2), then the ask. The planned
 * rows sit under the group that says roughly when, its label drawn once
 * (owner, 10 Oct 2026), where the design set a period on every row.
 *
 * The design draws a letter tile beside each name; until official partner
 * marks are in hand the name is set in type alone (R21). The card has one
 * signifier, "See {name} →", and names where it's connected as text (R9).
 *
 * With the AI apps switch on (plan 2026-11-13-002, U7; board
 * VSIntegrations), the cards come in two groups under headings, "AI apps"
 * first. With it off, the page is the flat list it always was.
 */
export const metadata = pageMetadata({
    title: page.seo.title,
    socialTitle: page.seo.socialTitle,
    description: page.seo.description,
    path: INTEGRATIONS_PATH,
});

export default function IntegrationsPage() {
    const cards = shownIntegrations(featuresOff());
    const ai = cards.filter((c) => c.category === "AI apps");
    const rest = cards.filter((c) => c.category !== "AI apps");
    const groupsOn = ai.length > 0;
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-center gap-3.5 pt-16 text-center"
            >
                <PageTitle size="page">{page.title}</PageTitle>
                <p className="m-0 max-w-[54ch] text-mk-band-body text-mk-copy">
                    {groupsOn ? page.introWithAi : page.intro}
                </p>
            </Container>

            {groupsOn ? (
                <>
                    <CardGroup
                        id="group-ai-apps"
                        {...page.groups["AI apps"]}
                        cards={ai}
                        stack
                    />
                    <CardGroup
                        id="group-payments"
                        {...page.groups.payments}
                        cards={rest}
                    />
                </>
            ) : (
                <Container className="pt-12">
                    <h2 className="sr-only">Available now</h2>
                    <Cards cards={rest} />
                </Container>
            )}

            <Container
                as="section"
                aria-labelledby="planned"
                className="grid gap-1 pt-[72px]"
            >
                <Eyebrow as="h2" id="planned" tone="muted" className="m-0 pb-1">
                    {page.plannedTitle}
                </Eyebrow>
                <p className="m-0 mb-3 max-w-[70ch] text-[15px] leading-[1.6] text-mk-copy">
                    {page.plannedIntro}
                </p>
                <ComingList items={plannedIntegrations} idPrefix="planned" />
            </Container>

            <Container className="pt-14">
                <p className="m-0 border-t border-border pt-[22px] text-[15px] leading-[1.6] text-mk-copy">
                    Need something else? Write to{" "}
                    <a
                        href={`mailto:${page.askEmail}?subject=Integration`}
                        className="text-brand-700 hover:text-foreground"
                    >
                        {page.askEmail}
                    </a>{" "}
                    and tell us what you use. It&apos;s how we decide what comes
                    next.
                </p>
            </Container>
        </>
    );
}

/** A group of cards under its heading, its line and an optional link. */
function CardGroup({
    id,
    title,
    line,
    link,
    cards,
    stack = false,
}: {
    id: string;
    title: string;
    line: string;
    link?: { label: string; href: string };
    cards: readonly LiveIntegration[];
    stack?: boolean;
}) {
    return (
        <Container
            as="section"
            aria-labelledby={id}
            className="grid gap-[18px] pt-14"
        >
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1.5">
                <div className="grid gap-1.5">
                    <h2
                        id={id}
                        className="m-0 font-display text-[22px] font-bold sm:text-[24px]"
                    >
                        {title}
                    </h2>
                    <p className="m-0 max-w-[70ch] text-[15px] leading-[1.6] text-mk-copy sm:text-[15.5px]">
                        {line}
                    </p>
                </div>
                {link ? (
                    <Link
                        href={link.href}
                        className={textLinkClasses({
                            className: "text-[14.5px]",
                        })}
                    >
                        {link.label}
                        <Arrow />
                    </Link>
                ) : null}
            </div>
            <Cards cards={cards} stack={stack} />
        </Container>
    );
}

/** The cards: each one link, naming where it's connected (R9). */
function Cards({
    cards,
    stack = false,
}: {
    cards: readonly LiveIntegration[];
    /** Four to a row: the connect line sits over the link, not beside it. */
    stack?: boolean;
}) {
    return (
        <ul
            className={cn(
                "m-0 grid list-none gap-[18px] p-0",
                stack
                    ? "grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]"
                    : "grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]",
            )}
        >
            {cards.map((item) => (
                <li key={item.slug} className="grid">
                    <Link
                        href={item.href}
                        className={cardLinkClasses("gap-3.5 p-[22px]")}
                    >
                        <span className="flex items-start gap-3">
                            <span className="grid">
                                <span className="text-[17px] font-semibold">
                                    {item.name}
                                </span>
                                <span className="text-[13px] text-muted-foreground">
                                    {item.kind ?? item.category}
                                </span>
                            </span>
                            <Pill tone="ok" className="ml-auto">
                                Available
                            </Pill>
                        </span>
                        <span className="flex-1 text-[14.5px] leading-[1.55] text-mk-copy [text-wrap:pretty]">
                            {item.line}
                        </span>
                        <span
                            className={cn(
                                "flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-[10px] border border-mk-line-soft bg-background px-3 py-2.5 text-[13px]",
                                stack ? "flex-col items-start" : "items-center",
                            )}
                        >
                            <span className="text-muted-foreground">
                                {item.connect}
                            </span>
                            <span className="font-semibold text-brand-700">
                                {item.cta}
                                <Arrow />
                            </span>
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
