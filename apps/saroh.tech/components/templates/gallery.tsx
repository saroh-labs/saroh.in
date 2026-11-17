import { PageHero } from "@saroh/marketing/page-hero";
import type { ReactNode } from "react";

import { CtaBand } from "@/components/shared/cta-band";
import { JsonLd } from "@/components/shared/json-ld";
import { COUNTRIES, DOCUMENTS, TRADES } from "@/content/templates";
import { itemListSchema, pageSchema } from "@/lib/schema";
import type { SitePage } from "@/lib/site-map";
import type { TemplatePage } from "@/lib/templates/pages";
import { cardOf } from "@/lib/templates/pages";

import { CardGrid, ChipLink } from "./blocks";

const LABEL =
    "w-full flex-none text-[13px] font-semibold text-muted-foreground md:w-[90px]";

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>{label}</span>
            {children}
        </div>
    );
}

/** Every chip opens its own page, so a filter is an address search can find. */
export function FilterChips({ current }: { current: string }) {
    return (
        <nav
            aria-label="Filter templates"
            className="flex flex-col gap-3 rounded-mk-card border border-border bg-card px-4 py-5 md:px-[22px]"
        >
            <Row label="Document">
                <ChipLink href="/templates" on={current === "/templates"}>
                    All
                </ChipLink>
                {DOCUMENTS.map((d) => (
                    <ChipLink key={d.slug} href={`/templates/${d.slug}`}>
                        {d.chip}
                    </ChipLink>
                ))}
            </Row>
            <Row label="Trade">
                {TRADES.map((t) => {
                    const href = `/templates/for/${t.slug}`;
                    return (
                        <ChipLink
                            key={t.slug}
                            href={href}
                            on={current === href}
                        >
                            {t.name}
                        </ChipLink>
                    );
                })}
            </Row>
            <Row label="Country">
                {COUNTRIES.map((c) => {
                    const href = `/templates/in/${c.slug}`;
                    return (
                        <ChipLink
                            key={c.slug}
                            href={href}
                            on={current === href}
                        >
                            {c.name}
                        </ChipLink>
                    );
                })}
            </Row>
        </nav>
    );
}

/** The gallery and the hubs: hero, filters, cards, whatever a hub knows, the band. */
export function GalleryPage({
    page,
    lede,
    pages,
    children,
}: {
    page: SitePage;
    lede: string;
    pages: readonly TemplatePage[];
    children?: ReactNode;
}) {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-8 px-mk-gutter min-[760px]:gap-10"
        >
            <JsonLd
                data={[
                    ...pageSchema(page),
                    itemListSchema(
                        page.h1,
                        pages.map((p) => ({ name: p.name, path: p.path })),
                    ),
                ]}
            />
            <PageHero
                crumbs={page.crumb?.map((c) => ({
                    name: c.name,
                    href: c.path,
                }))}
                title={page.h1}
                lead={lede}
                className="px-0 pb-0 min-[760px]:pb-0"
            />
            <FilterChips current={page.path} />
            <CardGrid cards={pages.map(cardOf)} />
            {children}
            <CtaBand
                title="Rather not fill a file?"
                line="The invoice generator does the sums and gives you a clean PDF. No sign-up."
                action="Open the invoice generator"
                href="/tools/invoice-generator"
                from="open-invoice-generator"
            />
        </div>
    );
}
