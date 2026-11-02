import Link from "next/link";

import { Breadcrumb } from "@/components/shared/breadcrumb";
import { Marked } from "@/components/shared/marked";
import type { LegalSection } from "@/content/legal";
import { placeholders } from "@/content/placeholders";
import type { SitePage } from "@/lib/site-map";

import { ContactCard } from "./contact-card";

const COPY = "m-0 text-[17px] leading-relaxed text-body";

function Section({ section }: { section: LegalSection }) {
    const { title, paragraphs, items, table, links } = section;
    return (
        <section className="flex flex-col gap-3">
            <h2 className="m-0 font-display text-2xl font-bold tracking-[-0.04em] md:text-[28px]">
                {title}
            </h2>
            {paragraphs?.map((text) => (
                <p key={text} className={COPY}>
                    <Marked text={text} />
                </p>
            ))}
            {items ? (
                <ul className={`${COPY} list-disc pl-5`}>
                    {items.map((text) => (
                        <li key={text}>{text}</li>
                    ))}
                </ul>
            ) : null}
            {table ? (
                <table className="w-full border-collapse text-left text-[15px] text-body">
                    <caption className="sr-only">{table.caption}</caption>
                    <thead>
                        <tr className="border-b border-strong text-ink">
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
                            <tr key={name} className="border-b border-line">
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
                    className="inline-flex min-h-11 items-center self-start text-[17px] md:min-h-0"
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
            className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 pt-6 md:px-20 md:pt-7"
        >
            {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
            <div className="flex flex-col gap-2.5">
                <h1 className="m-0 font-display text-[34px] font-bold leading-[1.02] tracking-[-0.045em] md:text-[56px] md:leading-none">
                    {page.h1}
                </h1>
                <p className="m-0 text-[15px] text-quiet">
                    Last updated: <Marked text={placeholders.legalUpdated} />
                </p>
            </div>
            <p
                role="note"
                className="m-0 max-w-[720px] rounded-card border border-saffron bg-saffron/10 px-5 py-4 text-[17px] leading-normal"
            >
                <b>Draft: not yet in force.</b> A lawyer hasn't read this page
                yet. Marked words are still to be confirmed.
            </p>
            <div className="grid gap-10 pt-2 lg:grid-cols-[minmax(0,720px)_320px] lg:justify-between">
                <div className="flex flex-col gap-9">
                    {sections.map((section) => (
                        <Section key={section.title} section={section} />
                    ))}
                </div>
                <aside className="lg:sticky lg:top-[calc(var(--st-header-h)+16px)] lg:self-start">
                    <ContactCard />
                </aside>
            </div>
        </div>
    );
}
