import Link from "next/link";
import type { ReactNode } from "react";

import { Breadcrumb } from "@/components/shared/breadcrumb";
import { CtaBand } from "@/components/shared/cta-band";
import type { Faq } from "@/components/shared/faq-list";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { faqSchema, howToSchema, pageSchema } from "@/lib/schema";
import type { SitePage } from "@/lib/site-map";
import { signupHref } from "@/site.config";

export interface ToolContent {
    tool: string;
    lede: string;
    /** The ticks beside the H1 on a desk. */
    ticks?: readonly string[];
    how?: {
        title: string;
        steps: readonly { title: string; text: string }[];
    };
    /** The tool's own explainer: a checklist, a table, a formula. */
    explain: ReactNode;
    faqs: readonly Faq[];
    more: readonly { title: string; line: string; href: string }[];
    templates?: readonly { name: string; href: string }[];
    band: { title: string; line?: string };
}

export const H2 =
    "m-0 font-display text-[26px] font-bold leading-[1.05] tracking-[-0.04em] md:text-[40px]";

/** Every tool's page, in the spec's order: the job first, the app second. */
export function ToolPage({
    page,
    content,
    children,
}: {
    page: SitePage;
    content: ToolContent;
    children: ReactNode;
}) {
    const { how, faqs, more, templates, band } = content;
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-3.5 px-mk-gutter pt-4 md:gap-7 md:pt-7"
        >
            <JsonLd
                data={[
                    ...pageSchema(page),
                    ...(how ? [howToSchema(how.title, how.steps)] : []),
                    faqSchema(faqs),
                ]}
            />
            {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
            <div className="flex items-end justify-between gap-10">
                <div className="flex flex-col gap-2.5">
                    <h1 className="m-0 font-display text-[34px] font-bold leading-[1.02] tracking-[-0.045em] md:text-[56px] md:leading-none">
                        {page.h1}
                    </h1>
                    <p className="m-0 text-base leading-snug text-body md:text-[19px]">
                        {content.lede}
                    </p>
                </div>
                {content.ticks ? (
                    <div className="hidden shrink-0 gap-[18px] text-sm text-body xl:flex">
                        {content.ticks.map((t) => (
                            <span key={t}>✓ {t}</span>
                        ))}
                    </div>
                ) : null}
            </div>

            {children}

            {how ? (
                <section className="flex flex-col gap-3 pt-7 md:gap-[22px] md:pt-10">
                    <h2 className={H2}>{how.title}</h2>
                    <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
                        {how.steps.map((s, i) => (
                            <li
                                key={s.title}
                                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5"
                            >
                                <span className="font-mono text-quiet">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <b className="text-[17px]">{s.title}</b>
                                <span className="text-[15px] text-body">
                                    {s.text}
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}

            <div className="grid gap-8 pt-6 lg:grid-cols-2 lg:gap-14">
                <div className="flex flex-col gap-4">{content.explain}</div>
                <section className="flex flex-col">
                    <h2 className={`${H2} mb-3`}>Questions</h2>
                    <FaqList items={faqs} />
                </section>
            </div>

            <section className="flex flex-col gap-[18px] pt-6">
                <h2 className="m-0 font-display text-2xl font-bold tracking-[-0.04em] md:text-[32px]">
                    More free tools
                </h2>
                <div className="grid gap-2.5 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
                    {more.map((m) => (
                        <Link
                            key={m.href}
                            prefetch={false}
                            href={m.href}
                            className="flex items-center justify-between gap-2.5 rounded-[14px] border border-line bg-surface px-4 py-3.5 no-underline transition-colors duration-150 hover:border-strong md:rounded-card md:p-5"
                        >
                            <span className="flex flex-col gap-1">
                                <b className="text-[17px]">{m.title}</b>
                                <span className="text-[15px] text-body">
                                    {m.line}
                                </span>
                            </span>
                            <span aria-hidden="true" className="md:hidden">
                                →
                            </span>
                        </Link>
                    ))}
                </div>
                {templates ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="mr-1 text-[13px] text-quiet">
                            Templates:
                        </span>
                        {templates.map((t) => (
                            <Link
                                key={t.href}
                                prefetch={false}
                                href={t.href}
                                className="inline-flex h-11 items-center rounded-full border border-control bg-surface px-3 text-sm no-underline md:h-8"
                            >
                                {t.name}
                            </Link>
                        ))}
                    </div>
                ) : null}
            </section>

            <div className="pt-6 md:pt-12">
                <CtaBand
                    title={band.title}
                    line={band.line}
                    action="Start free"
                    href={signupHref("tool", { tool: content.tool })}
                    from="start-free-band"
                />
            </div>
        </div>
    );
}
