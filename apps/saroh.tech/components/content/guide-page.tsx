import Link from "next/link";

import { Breadcrumb } from "@/components/shared/breadcrumb";
import { ButtonLink } from "@/components/shared/button";
import { ConfirmTag } from "@/components/shared/confirm-tag";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import type { Guide, GuideBlock } from "@/content/guides";
import { guideOf, guideSteps, readMinutes } from "@/content/guides";
import { placeholders } from "@/content/placeholders";
import {
    articleSchema,
    faqSchema,
    howToSchema,
    pageSchema,
} from "@/lib/schema";
import type { SitePage } from "@/lib/site-map";

const LABEL = "text-xs font-semibold uppercase tracking-[0.08em] text-quiet";
const COPY = "m-0 text-[17px] leading-[1.7] text-[#2B2A27] md:text-lg";
const H2 =
    "m-0 mb-3 mt-9 scroll-mt-[calc(var(--st-header-h)+16px)] font-display text-[26px] font-bold leading-[1.1] tracking-[-0.035em] md:mt-11 md:text-[32px]";

function Block({ block, guide }: { block: GuideBlock; guide: Guide }) {
    switch (block.kind) {
        case "text":
            return <p className={`${COPY} mb-4`}>{block.text}</p>;
        case "list":
            return (
                <ul className={`${COPY} mb-4 list-disc pl-[22px]`}>
                    {block.items.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            );
        case "checklist":
            return (
                <ul className={`${COPY} mb-4 list-none p-0`}>
                    {block.items.map((item) => (
                        <li key={item} className="flex gap-3">
                            <span aria-hidden="true">✓</span>
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            );
        case "steps":
            return (
                <ol className="m-0 list-none border-b border-line p-0">
                    {block.items.map((step, i) => (
                        <li
                            key={step.title}
                            className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 border-t border-line py-[18px]"
                        >
                            <span
                                aria-hidden="true"
                                className="flex size-9 items-center justify-center rounded-full border-[1.9px] border-ink font-mono text-sm"
                            >
                                {i + 1}
                            </span>
                            <div>
                                <b className="text-lg">{step.title}</b>
                                <p className={`${COPY} mt-1.5`}>{step.text}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            );
        case "lines":
            return (
                <div
                    role="img"
                    aria-label={block.label}
                    className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] gap-y-1.5 rounded-[14px] border border-line bg-surface px-[22px] py-5 text-[15.5px] leading-normal"
                >
                    {block.rows.map(([name, amount]) => (
                        <div key={name} className="contents">
                            <span>{name}</span>
                            <span className="pl-6 text-right font-mono">
                                {amount}
                            </span>
                        </div>
                    ))}
                    <b className="border-t border-ink pt-1.5">
                        {block.total[0]}
                    </b>
                    <b className="border-t border-ink pl-6 pt-1.5 text-right font-mono">
                        {block.total[1]}
                    </b>
                </div>
            );
        case "message":
            return (
                <figure className="m-0 mb-3 rounded-[14px] border border-line bg-surface px-[22px] py-5">
                    <figcaption className={`${LABEL} mb-2`}>
                        {block.title}
                    </figcaption>
                    <p className="m-0 text-base leading-relaxed">
                        {block.text}
                    </p>
                </figure>
            );
        case "table":
            return (
                <div className="mb-4 overflow-hidden rounded-[14px] border border-line bg-surface">
                    <table className="w-full border-collapse text-[14.5px] leading-[1.45] md:text-base">
                        <thead>
                            <tr>
                                {block.head.map((h) => (
                                    <th
                                        key={h}
                                        scope="col"
                                        className="border-b border-strong p-3 text-left text-[13px] font-semibold text-quiet md:px-5 md:py-4"
                                    >
                                        {h || (
                                            <span className="sr-only">
                                                Compare
                                            </span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.rows.map(([first, ...rest]) => (
                                <tr
                                    key={first}
                                    className="border-b border-line last:border-b-0"
                                >
                                    <th
                                        scope="row"
                                        className="p-3 text-left align-top font-semibold md:px-5 md:py-4"
                                    >
                                        {first}
                                    </th>
                                    {rest.map((cell) => (
                                        <td
                                            key={cell}
                                            className="p-3 align-top md:px-5 md:py-4"
                                        >
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case "sources":
            return (
                <ul className="mb-4 flex list-none flex-col p-0 text-base">
                    {block.items.map((s) => (
                        <li key={s.href}>
                            <a
                                href={s.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-11 items-center md:min-h-8"
                            >
                                {s.name}
                            </a>
                        </li>
                    ))}
                </ul>
            );
        case "tool":
            return (
                <div className="my-8 flex flex-col gap-5 rounded-[18px] bg-ink px-7 py-[26px] text-paper md:flex-row md:items-center md:justify-between md:gap-6">
                    <div>
                        <b className="font-display text-xl tracking-[-0.02em]">
                            {block.title}
                        </b>
                        <p className="m-0 mt-1.5 text-base text-[#D8D5CC]">
                            {block.line}
                        </p>
                    </div>
                    <ButtonLink
                        href={guide.tool.href}
                        data-cta="guide-tool"
                        className="shrink-0 whitespace-normal !bg-paper text-center !text-ink hover:!bg-white md:whitespace-nowrap"
                    >
                        Try the {guide.tool.name}
                    </ButtonLink>
                </div>
            );
    }
}

/** Every guide, in the spec's order: the answer first, then the tool. */
export function GuidePage({ page, guide }: { page: SitePage; guide: Guide }) {
    const steps = guideSteps(guide);
    const toc = [
        { id: "short-answer", title: "The short answer" },
        ...guide.sections,
        { id: "questions", title: "Questions" },
    ];
    return (
        <div
            data-page-type={page.type}
            className="mx-auto max-w-mk-page px-mk-gutter pt-4 md:pt-10"
        >
            <JsonLd
                data={[
                    ...(steps.length
                        ? [howToSchema(page.h1, steps)]
                        : [articleSchema(page)]),
                    faqSchema(guide.faqs),
                    ...pageSchema(page),
                ]}
            />
            <div className="grid gap-10 xl:grid-cols-[240px_minmax(0,720px)_minmax(0,1fr)] xl:gap-16">
                <div className="hidden pt-[210px] xl:block">
                    <nav
                        aria-label="On this page"
                        className="sticky top-[calc(var(--st-header-h)+16px)]"
                    >
                        <span className={LABEL}>On this page</span>
                        <ul className="m-0 mt-2 list-none p-0">
                            {toc.map((t) => (
                                <li key={t.id}>
                                    <a
                                        href={`#${t.id}`}
                                        className="block py-[7px] text-[15px] text-body no-underline hover:underline"
                                    >
                                        {t.title}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>

                <article className="min-w-0">
                    {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                    <h1 className="m-0 mb-4 mt-3.5 font-display text-[38px] font-bold leading-none tracking-[-0.05em] md:text-[64px]">
                        {page.h1}
                    </h1>
                    <div className="mb-7 flex flex-wrap items-center gap-3 text-sm text-quiet">
                        <span
                            aria-hidden="true"
                            className="inline-block size-8 rounded-full bg-[#EAE6DE]"
                        />
                        <ConfirmTag>{placeholders.guideAuthor}</ConfirmTag>
                        <span>{readMinutes(guide)} min read</span>
                    </div>

                    <div
                        id="short-answer"
                        className="mb-2 scroll-mt-[calc(var(--st-header-h)+16px)] rounded-card border border-ink bg-surface px-6 py-[22px]"
                    >
                        <span className={LABEL}>The short answer</span>
                        <p className="m-0 mt-2 text-lg leading-relaxed">
                            {guide.short}
                        </p>
                    </div>

                    {guide.sections.map((section) => (
                        <section key={section.id}>
                            <h2 id={section.id} className={H2}>
                                {section.title}
                            </h2>
                            {section.blocks.map((block, i) => (
                                <Block key={i} block={block} guide={guide} />
                            ))}
                        </section>
                    ))}

                    <section>
                        <h2 id="questions" className={H2}>
                            Questions
                        </h2>
                        <FaqList items={guide.faqs} />
                    </section>
                    <p className="m-0 mt-6 text-sm text-quiet">
                        This guide is general information, not tax or legal
                        advice.
                    </p>
                </article>

                <aside className="flex flex-col gap-3.5 xl:pt-[210px]">
                    <span className={LABEL}>Read next</span>
                    {guide.next.map((slug) => {
                        const { title, line } = guideOf(slug).card;
                        return (
                            <Link
                                key={slug}
                                prefetch={false}
                                href={`/guides/${slug}`}
                                className="flex flex-col rounded-[14px] border border-line bg-surface p-4 no-underline transition-colors duration-150 hover:border-strong"
                            >
                                <b>{title}</b>
                                <span className="text-sm text-quiet">
                                    {line}
                                </span>
                            </Link>
                        );
                    })}
                </aside>
            </div>

            <div className="pt-10 md:pt-[72px]">
                <CtaBand
                    title={guide.band.title}
                    line={guide.band.line}
                    action={`Try the ${guide.tool.name}`}
                    href={guide.tool.href}
                    from="guide-tool-band"
                />
            </div>
        </div>
    );
}
