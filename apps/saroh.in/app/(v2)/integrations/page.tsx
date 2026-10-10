import Link from "next/link";

import { Arrow } from "@/components/v2/arrow";
import { Container } from "@/components/v2/container";
import { byComingGroup } from "@/content/coming";
import {
    integrationHref,
    INTEGRATIONS_PATH,
    liveIntegrations,
    integrationsIndex as page,
    plannedIntegrations,
} from "@/content/integrations";
import { pageMetadata } from "@/lib/seo";

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
 */
export const metadata = pageMetadata({
    title: page.seo.title,
    socialTitle: page.seo.socialTitle,
    description: page.seo.description,
    path: INTEGRATIONS_PATH,
});

export default function IntegrationsPage() {
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-center gap-3.5 pt-16 text-center"
            >
                <h1 className="m-0 font-display text-[clamp(36px,6vw,52px)] font-bold leading-none tracking-[-0.045em]">
                    {page.title}
                </h1>
                <p className="m-0 max-w-[54ch] text-mk-band-body text-mk-copy">
                    {page.intro}
                </p>
            </Container>

            <Container className="pt-12">
                <h2 className="sr-only">Available now</h2>
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[18px] p-0">
                    {liveIntegrations.map((item) => (
                        <li key={item.slug} className="grid">
                            <Link
                                href={integrationHref(item.slug)}
                                className="grid cursor-pointer content-start gap-3.5 rounded-[18px] border border-border bg-card p-[22px] text-foreground no-underline transition-[border-color,box-shadow] duration-base ease-out hover:border-foreground hover:text-foreground hover:shadow-mk-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                            >
                                <span className="flex items-start gap-3">
                                    <span className="grid">
                                        <span className="text-[17px] font-semibold">
                                            {item.name}
                                        </span>
                                        <span className="text-[13px] text-muted-foreground">
                                            {item.category}
                                        </span>
                                    </span>
                                    <span className="ml-auto rounded-full bg-mk-ok-tint px-[9px] py-[3px] text-[12px] font-semibold text-mk-ok">
                                        Available
                                    </span>
                                </span>
                                <span className="text-[14.5px] leading-[1.55] text-mk-copy [text-wrap:pretty]">
                                    {item.line}
                                </span>
                                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[10px] border border-mk-line-soft bg-background px-3 py-2.5 text-[13px]">
                                    <span className="text-muted-foreground">
                                        Connect in {item.where}
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
            </Container>

            <Container
                as="section"
                aria-labelledby="planned"
                className="grid gap-1 pt-[72px]"
            >
                <h2
                    id="planned"
                    className="m-0 pb-1 text-mk-eyebrow font-semibold uppercase text-muted-foreground"
                >
                    {page.plannedTitle}
                </h2>
                <p className="m-0 mb-3 max-w-[70ch] text-[15px] leading-[1.6] text-mk-copy">
                    {page.plannedIntro}
                </p>
                {byComingGroup(plannedIntegrations).map((group) => (
                    <div
                        key={group.key}
                        className="grid pt-4 first-of-type:pt-0"
                    >
                        <h3
                            id={`planned-${group.key}`}
                            className="m-0 pb-2.5 font-mono text-[12.5px] font-normal text-muted-foreground"
                        >
                            {group.label}
                        </h3>
                        <ul
                            aria-labelledby={`planned-${group.key}`}
                            className="m-0 list-none p-0"
                        >
                            {group.rows.map((item) => (
                                <li
                                    key={item.name}
                                    className="flex flex-wrap items-baseline gap-x-7 gap-y-2 border-t border-dashed border-border-strong py-5 text-muted-foreground"
                                >
                                    <span className="flex-[0_0_200px] text-[18px] font-semibold text-mk-copy">
                                        {item.name}
                                    </span>
                                    <span className="flex-[1_1_340px] text-[15px] leading-[1.55]">
                                        {item.line}
                                    </span>
                                    <span className="rounded-full border border-border-strong px-[9px] py-[3px] text-[12.5px] font-semibold">
                                        {page.notYet}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
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
