import { markTitle } from "@saroh/marketing/page-hero";
import { SectionHeading } from "@saroh/marketing/section-heading";
import { textLinkClasses } from "@saroh/marketing/text-link";
import Link from "next/link";

import { Breadcrumb } from "@/components/shared/breadcrumb";
import { SUPPORT_EMAIL } from "@/content/contact";
import type { LegalSection } from "@/content/legal";
import { LEGAL_UPDATED } from "@/content/legal";
import type { SitePage } from "@/lib/site-map";
import { formatDate } from "@/lib/tools/dates";

import { ContactCard } from "./contact-card";

const COPY = "m-0 text-[17px] leading-relaxed text-mk-copy";

/** A legal sentence, with the address in it a link, as saroh.in's are. */
function Sentence({ text }: { text: string }) {
    const [before, ...rest] = text.split(SUPPORT_EMAIL);
    return rest.length === 0 ? (
        text
    ) : (
        <>
            {before}
            <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className={textLinkClasses({ tone: "prose" })}
            >
                {SUPPORT_EMAIL}
            </a>
            {rest.join(SUPPORT_EMAIL)}
        </>
    );
}

function Section({ section }: { section: LegalSection }) {
    const { title, paragraphs, items, table, links } = section;
    return (
        <section className="flex flex-col gap-3">
            <h2 className="m-0 font-display text-mk-kit-h3 font-bold [text-wrap:balance]">
                {title}
            </h2>
            {paragraphs?.map((text) => (
                <p key={text} className={COPY}>
                    <Sentence text={text} />
                </p>
            ))}
            {items ? (
                <ul className={`${COPY} list-disc pl-5`}>
                    {items.map((text) => (
                        <li key={text}>
                            <Sentence text={text} />
                        </li>
                    ))}
                </ul>
            ) : null}
            {table ? (
                <table className="w-full border-collapse text-left text-[15px] text-mk-copy">
                    <caption className="sr-only">{table.caption}</caption>
                    <thead>
                        <tr className="border-b border-border-strong text-foreground">
                            {table.head.map((h) => (
                                <th
                                    key={h}
                                    scope="col"
                                    className="py-2 pr-3 font-semibold"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.rows.map(([name, what, long]) => (
                            <tr key={name} className="border-b border-border">
                                <td className="py-3 pr-3 align-top font-mono text-[13px] [overflow-wrap:anywhere]">
                                    {name}
                                </td>
                                <td className="py-3 pr-3 align-top">{what}</td>
                                <td className="py-3 align-top">{long}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : null}
            {links?.map((l) => (
                <Link
                    key={l.href}
                    prefetch={false}
                    href={l.href}
                    className={textLinkClasses({
                        tone: "ink",
                        className: "self-start text-[17px]",
                    })}
                >
                    {l.name}
                </Link>
            ))}
        </section>
    );
}

/** A legal page: a draft until a lawyer has read it, and it says so at the top. */
export function LegalPage({
    page,
    sections,
}: {
    page: SitePage;
    sections: readonly LegalSection[];
}) {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-6 px-mk-gutter pt-8 min-[760px]:pt-10"
        >
            {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
            <div className="flex flex-col gap-4">
                <SectionHeading
                    as="h1"
                    size="kit-h1"
                    title={markTitle(page.h1)}
                />
                <p className="m-0 text-[15px] text-muted-foreground">
                    Last updated: {formatDate(LEGAL_UPDATED)}
                </p>
            </div>
            <p
                role="note"
                className="m-0 max-w-[720px] rounded-mk-card border border-brand-500 bg-brand-500/10 px-5 py-4 text-[17px] leading-normal"
            >
                <b>Draft: not yet in force.</b> A lawyer hasn't read this page
                yet.
            </p>
            <div className="grid gap-10 pt-2 lg:grid-cols-[minmax(0,720px)_320px] lg:justify-between">
                <div className="flex flex-col gap-9">
                    {sections.map((section) => (
                        <Section key={section.title} section={section} />
                    ))}
                </div>
                <aside className="lg:sticky lg:top-[calc(var(--mk-nav-h)+16px)] lg:self-start">
                    <ContactCard />
                </aside>
            </div>
        </div>
    );
}
