import Link from "next/link";

import { ButtonLink } from "@/components/shared/button";
import { Card, LinkCard } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { TextLink } from "@/components/shared/text-link";
import { CHANGELOG, changelogPath } from "@/content/changelog";
import { faqItems, HOME_FAQ } from "@/content/faq";
import { featureList } from "@/content/features";
import { CTA_BAND, home } from "@/content/home";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageAt, pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/");

export const metadata = pageMetadata(page);

const WRAP = "mx-auto w-full max-w-[1440px] px-4 md:px-20";
const H2 =
    "m-0 font-display text-[32px] font-bold leading-[1.05] tracking-[-0.045em] md:text-5xl md:leading-[1.02]";
const LEAD =
    "m-0 text-[16.5px] leading-normal text-body md:text-[19px] md:leading-[1.55]";

const FAQS = faqItems(HOME_FAQ).map(({ q, a }) => ({
    question: q,
    answer: a,
}));

// An entry still marked example would make this page hold a placeholder.
const LATEST = CHANGELOG.filter((e) => !e.example).slice(0, 3);

export default function HomePage() {
    return (
        <div data-page-type={page.type} className="flex flex-col">
            <JsonLd data={pageSchema(page)} />

            <section
                className={`${WRAP} flex flex-col gap-[18px] pt-7 md:gap-6 xl:pt-16`}
            >
                <span className="text-[13px] font-semibold text-quiet md:text-sm md:tracking-[.02em]">
                    {home.eyebrow}
                </span>
                <h1 className="m-0 font-display text-[44px] font-bold leading-none tracking-[-0.05em] md:text-[76px] md:leading-[0.98]">
                    {page.h1}
                </h1>
                <p className={`${LEAD} max-w-[760px]`}>{home.sub}</p>
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-5">
                    <ButtonLink
                        href={signupHref(page.type)}
                        data-cta="start-free-page"
                    >
                        Start free
                    </ButtonLink>
                    <TextLink
                        href="/tools/invoice-generator"
                        className="justify-center"
                    >
                        Try the free invoice generator →
                    </TextLink>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-[13px] text-body md:justify-start md:gap-5 md:text-[14.5px]">
                    {home.chips.map((chip) => (
                        <span key={chip}>{chip}</span>
                    ))}
                </div>
            </section>

            <section
                className={`${WRAP} flex flex-col gap-3.5 pb-4 pt-12 md:gap-9 md:pb-10 md:pt-24`}
            >
                <h2 className={H2}>{home.featuresTitle}</h2>
                <ul className="m-0 grid list-none gap-2.5 p-0 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
                    {featureList.map((f) => (
                        <li key={f.slug}>
                            <Card className="h-full !gap-1.5 !p-[18px] md:!gap-2.5 md:!p-6">
                                <span className="font-display text-[19px] font-bold tracking-[-0.03em] md:text-[21px]">
                                    {f.name}
                                </span>
                                <p className="m-0 text-[15px] leading-normal text-body md:text-[15.5px]">
                                    {f.homeBody}
                                </p>
                            </Card>
                        </li>
                    ))}
                </ul>
            </section>

            <section
                className={`${WRAP} flex flex-col gap-3 pb-4 pt-9 md:gap-7 md:py-14`}
            >
                <div className="flex items-end justify-between gap-6">
                    <div className="flex flex-col gap-3">
                        <h2 className={H2}>{home.toolsTitle}</h2>
                        <p className={LEAD}>{home.toolsLead}</p>
                    </div>
                    <TextLink
                        href="/tools"
                        className="hidden shrink-0 md:inline-flex"
                    >
                        All tools →
                    </TextLink>
                </div>
                <div className="grid gap-3 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
                    {home.tools.map((tool) => (
                        <LinkCard
                            key={tool.href}
                            title={tool.title}
                            line={tool.line}
                            href={tool.href}
                            className={"desk" in tool ? "hidden md:flex" : ""}
                        />
                    ))}
                </div>
                <TextLink href="/tools" className="md:hidden">
                    All tools →
                </TextLink>
            </section>

            <section className={`${WRAP} pt-9 md:py-14`}>
                <Card className="items-start !gap-2.5 !p-[22px] md:!gap-3.5 md:!p-9">
                    <h2 className={`${H2} !text-[28px] md:!text-[40px]`}>
                        Free to start.
                    </h2>
                    <p className="m-0 text-[15px] leading-normal text-body md:text-[17px]">
                        {CTA_BAND.note}
                    </p>
                    <TextLink href="/pricing">See all plans →</TextLink>
                </Card>
            </section>

            <section
                className={`${WRAP} grid gap-1.5 pt-9 md:py-14 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-14`}
            >
                <h2 className={H2}>{home.faqTitle}</h2>
                <FaqList items={FAQS} />
            </section>

            {LATEST.length > 0 ? (
                <section
                    className={`${WRAP} flex flex-col gap-3 pt-9 md:gap-5 md:pb-14 md:pt-0`}
                >
                    <div className="flex items-end justify-between gap-6">
                        <h2 className={H2}>What&apos;s new</h2>
                        <TextLink href="/changelog" className="shrink-0">
                            Changelog →
                        </TextLink>
                    </div>
                    <div className="grid gap-3 md:gap-5 xl:grid-cols-3">
                        {LATEST.map((e) => (
                            <Link
                                key={e.slug}
                                prefetch={false}
                                href={
                                    pageAt(changelogPath(e))
                                        ? changelogPath(e)
                                        : "/changelog"
                                }
                                className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-[18px] no-underline transition-colors duration-150 hover:border-strong md:p-6"
                            >
                                <span className="font-mono text-[13px] text-quiet">
                                    {e.date}
                                </span>
                                <b className="text-[17px]">{e.title}</b>
                                <span className="text-[15px] leading-normal text-body">
                                    {e.summary}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}

            <div className={`${WRAP} pt-9 md:pt-10`}>
                <CtaBand
                    title={home.closer}
                    line={`${CTA_BAND.body} ${CTA_BAND.note}`}
                    action="Start free"
                    href={signupHref(page.type)}
                    from="start-free-band"
                />
            </div>
        </div>
    );
}
