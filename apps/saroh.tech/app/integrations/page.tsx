import { ComingList } from "@saroh/marketing/coming-list";
import { Container } from "@saroh/marketing/container";
import { Eyebrow } from "@saroh/marketing/eyebrow";
import { PageTitle } from "@saroh/marketing/page-title";
import { Pill } from "@saroh/marketing/pill";
import { textLinkClasses } from "@saroh/marketing/text-link";
import Link from "next/link";

import { JsonLd } from "@/components/shared/json-ld";
import { INTEGRATIONS as page } from "@/content/integrations";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const entry = pageOf("/integrations");

export const metadata = pageMetadata(entry);

/** saroh.in's Integrations: its cards, not links here as there's no page behind them. */
export default function IntegrationsPage() {
    return (
        <div data-page-type={entry.type}>
            <JsonLd data={pageSchema(entry)} />
            <Container
                as="header"
                className="grid justify-items-center gap-3.5 pt-16 text-center"
            >
                <PageTitle size="page">{entry.h1}</PageTitle>
                <p className="m-0 max-w-[54ch] text-mk-band-body text-mk-copy">
                    {page.intro}
                </p>
            </Container>

            <Container className="pt-12">
                <h2 className="sr-only">Available now</h2>
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[18px] p-0">
                    {page.live.map((item) => (
                        <li
                            key={item.name}
                            className="grid content-start gap-3.5 rounded-mk-card border border-border bg-card p-[22px] text-foreground"
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
                                <Pill tone="ok" className="ml-auto">
                                    {page.available}
                                </Pill>
                            </span>
                            <span className="text-[14.5px] leading-[1.55] text-mk-copy [text-wrap:pretty]">
                                {item.line}
                            </span>
                            <span className="rounded-[10px] border border-mk-line-soft bg-background px-3 py-2.5 text-[13px] text-muted-foreground">
                                {item.where}
                            </span>
                        </li>
                    ))}
                </ul>
            </Container>

            <Container
                as="section"
                aria-labelledby="planned"
                id="planned-list"
                className="grid gap-1 pt-[72px]"
            >
                <Eyebrow as="h2" id="planned" tone="muted" className="m-0 pb-1">
                    {page.plannedTitle}
                </Eyebrow>
                <p className="m-0 mb-3 max-w-[70ch] text-[15px] leading-[1.6] text-mk-copy">
                    {page.plannedIntro}
                </p>
                <ComingList
                    groups={page.planned}
                    idPrefix="planned"
                    mark={page.notYet}
                />
            </Container>

            <Container className="pt-14">
                <p className="m-0 border-t border-border pt-[22px] text-[15px] leading-[1.6] text-mk-copy">
                    {page.ask.before}{" "}
                    <Link
                        href="/contact"
                        className={textLinkClasses({ className: "underline" })}
                    >
                        {page.ask.link}
                    </Link>
                    . {page.ask.after}
                </p>
            </Container>
        </div>
    );
}
