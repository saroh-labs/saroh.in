import { ComingList } from "@saroh/marketing/coming-list";
import { Container } from "@saroh/marketing/container";
import {
    IntegrationCardHead,
    PlannedSection,
} from "@saroh/marketing/integration-parts";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { PageHero } from "@saroh/marketing/page-hero";
import { textLinkClasses } from "@saroh/marketing/text-link";
import Link from "next/link";

import { JsonLd } from "@/components/shared/json-ld";
import { INTEGRATIONS as page } from "@/content/integrations";
import { featuresOff } from "@/lib/feature-switches";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const entry = pageOf("/integrations");

export const metadata = pageMetadata(entry);

/** The AI apps first, while their switch is on (plan 2026-11-13-002, U16). */
const live = [
    ...(featuresOff().includes("ai-apps") ? [] : page.aiApps),
    ...page.live,
];

/** saroh.in's Integrations: its cards, not links here as there's no page behind them. */
export default function IntegrationsPage() {
    return (
        <div data-page-type={entry.type}>
            <JsonLd data={pageSchema(entry)} />
            <PageHero
                title={entry.h1}
                lead={page.intro}
                className="pb-0 min-[760px]:pb-0"
            />

            <Container className="pt-10">
                <h2 className="sr-only">Available now</h2>
                <SwipeRow label="Available now">
                    {live.map((item) => (
                        <div
                            key={item.name}
                            className="grid h-full content-start gap-3.5 rounded-mk-card border border-border bg-card p-[22px] text-foreground"
                        >
                            <IntegrationCardHead
                                name={item.name}
                                kind={item.category}
                                available={page.available}
                            />
                            <span className="text-[15px] leading-[1.55] text-mk-copy [text-wrap:pretty]">
                                {item.line}
                            </span>
                            <span className="rounded-mk-crop border border-mk-line-soft bg-background px-3 py-2.5 text-[13px] text-muted-foreground">
                                {item.where}
                            </span>
                        </div>
                    ))}
                </SwipeRow>
            </Container>

            <PlannedSection
                id="planned-list"
                title={page.plannedTitle}
                intro={page.plannedIntro}
            >
                <ComingList
                    groups={page.planned}
                    idPrefix="planned"
                    mark={page.notYet}
                />
            </PlannedSection>

            <Container className="pb-[72px] pt-14 min-[760px]:pb-[120px]">
                <p className="m-0 border-t border-border pt-6 text-[16px] leading-[1.6] text-mk-copy">
                    {page.ask.before}{" "}
                    <Link
                        prefetch={false}
                        href="/contact"
                        className={textLinkClasses({ tone: "prose" })}
                    >
                        {page.ask.link}
                    </Link>
                    . {page.ask.after}
                </p>
            </Container>
        </div>
    );
}
