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
import {
    IntegrationCardHead,
    PlannedSection,
} from "@saroh/marketing/integration-parts";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { PageHero } from "@saroh/marketing/page-hero";
import { TextLink } from "@saroh/marketing/text-link";

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
            <PageHero
                title={page.title}
                lead={groupsOn ? page.introWithAi : page.intro}
                className="pb-0 min-[760px]:pb-0"
            />

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
                <Container className="pt-10">
                    <h2 className="sr-only">Available now</h2>
                    <Cards cards={rest} />
                </Container>
            )}

            <PlannedSection title={page.plannedTitle} intro={page.plannedIntro}>
                <ComingList items={plannedIntegrations} idPrefix="planned" />
            </PlannedSection>

            <Container className="pb-[72px] pt-14 min-[760px]:pb-[120px]">
                <p className="m-0 border-t border-border pt-6 text-[16px] leading-[1.6] text-mk-copy">
                    Need something else? Write to{" "}
                    <a
                        href={`mailto:${page.askEmail}?subject=Integration`}
                        className="font-semibold text-foreground underline decoration-border-strong underline-offset-[3px] hover:decoration-foreground"
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
            className="grid grid-cols-[minmax(0,1fr)] gap-6 pt-10 min-[760px]:pt-14"
        >
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1.5">
                <div className="grid gap-1.5">
                    <h2
                        id={id}
                        className="m-0 font-display text-mk-kit-h3 font-bold"
                    >
                        {title}
                    </h2>
                    <p className="m-0 max-w-[70ch] text-[16px] leading-[1.6] text-mk-copy">
                        {line}
                    </p>
                </div>
                {link ? (
                    <TextLink href={link.href} tone="ink" arrow>
                        {link.label}
                    </TextLink>
                ) : null}
            </div>
            <Cards cards={cards} stack={stack} />
        </Container>
    );
}

/**
 * The cards: each one link, naming where it's connected (R9). Three or
 * more swipe on a phone (PHONE.md), one in full and the next peeking.
 */
function Cards({
    cards,
    stack = false,
}: {
    cards: readonly LiveIntegration[];
    /** Four to a row: past phone width the connect line sits over the link. */
    stack?: boolean;
}) {
    const items = cards.map((item) => (
        <Link
            key={item.slug}
            href={item.href}
            className={cardLinkClasses(
                // A column, so the line grows and the connect rows line up.
                "flex h-full flex-col gap-3.5 p-[22px]",
            )}
        >
            <IntegrationCardHead
                name={item.name}
                kind={item.kind ?? item.category}
                available="Available"
            />
            <span className="flex-1 text-[15px] leading-[1.55] text-mk-copy [text-wrap:pretty]">
                {item.line}
            </span>
            <span
                className={cn(
                    "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-mk-crop border border-mk-line-soft bg-background px-3 py-2.5 text-[13px]",
                    stack && "sm:flex-col sm:items-start",
                )}
            >
                <span className="text-muted-foreground">{item.connect}</span>
                <span className="font-semibold text-foreground underline decoration-border-strong underline-offset-[3px]">
                    {item.cta}
                    <Arrow />
                </span>
            </span>
        </Link>
    ));
    if (cards.length >= 3) {
        return (
            <SwipeRow label="Integrations" columns={stack ? 4 : 3}>
                {items}
            </SwipeRow>
        );
    }
    return (
        <ul
            className={cn(
                "m-0 grid list-none gap-[18px] p-0",
                stack
                    ? "grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]"
                    : "grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]",
            )}
        >
            {items.map((card) => (
                <li key={card.key} className="grid">
                    {card}
                </li>
            ))}
        </ul>
    );
}
