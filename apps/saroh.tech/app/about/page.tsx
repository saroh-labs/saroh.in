import { Arrow } from "@saroh/marketing/arrow";
import { ButtonLink } from "@saroh/marketing/button";
import { Container } from "@saroh/marketing/container";
import { Eyebrow } from "@saroh/marketing/eyebrow";
import { Section } from "@saroh/marketing/section";
import { textLinkClasses } from "@saroh/marketing/text-link";
import localFont from "next/font/local";
import Link from "next/link";
import type { ReactNode } from "react";

import { JsonLd } from "@/components/shared/json-ld";
import { ABOUT } from "@/content/about";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref, site } from "@/site.config";

const page = pageOf("/about");

export const metadata = pageMetadata(page);

/* saroh.in's subset of Noto Sans Devanagari: the name and its two halves. */
const devanagari = localFont({
    src: "../fonts/NotoSansDevanagari-about.woff2",
    weight: "400 700",
    style: "normal",
    display: "swap",
    variable: "--font-devanagari",
});
const HINDI = "font-[family-name:var(--font-devanagari)]";

export default function Page() {
    const { meaning, values, where, company, band } = ABOUT;
    return (
        <div data-page-type={page.type} className={devanagari.variable}>
            <JsonLd data={pageSchema(page)} />
            <Container
                as="header"
                className="grid justify-items-start gap-[18px] pt-[72px]"
            >
                <Eyebrow>{ABOUT.eyebrow}</Eyebrow>
                <h1 className="m-0 max-w-[17ch] font-display text-mk-pricing-hero font-bold [text-wrap:balance]">
                    {ABOUT.title}
                </h1>
                <p className="m-0 max-w-[60ch] text-mk-intro text-mk-copy [text-wrap:pretty]">
                    {ABOUT.lead}
                </p>
            </Container>

            <Container
                as="section"
                aria-labelledby="about-name"
                className="pt-24"
            >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-10 rounded-mk-band bg-foreground p-[clamp(32px,6vw,72px)] text-background">
                    <div className="grid gap-[14px]">
                        <Eyebrow
                            as="h2"
                            id="about-name"
                            tone="on-ink"
                            className="m-0"
                        >
                            {meaning.eyebrow}
                        </Eyebrow>
                        <div className="flex items-end gap-2.5">
                            <span
                                lang="hi"
                                className={`${HINDI} text-[min(clamp(72px,10vw,120px),21vw)] font-bold leading-[1.15]`}
                            >
                                {meaning.word}
                            </span>
                            <span
                                aria-hidden
                                className="mb-[clamp(26px,3.6vw,40px)] size-4 flex-none rounded-full bg-mk-saffron"
                            />
                        </div>
                    </div>
                    <div className="grid gap-[18px] text-mk-band-body text-mk-on-ink">
                        <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-[18px] gap-y-1.5">
                            {meaning.parts.map((part) => (
                                <NameLine key={part.roman} part={part} />
                            ))}
                        </div>
                        <p className="m-0 border-t border-mk-ink-hover pt-[18px] [text-wrap:pretty]">
                            {meaning.together.before}
                            <strong className="font-semibold text-background">
                                {meaning.together.strong}
                            </strong>
                            {meaning.together.after}
                        </p>
                        <span className="font-display text-[22px] font-semibold text-mk-saffron">
                            {meaning.line}
                        </span>
                    </div>
                </div>
            </Container>

            <Section
                titleId="about-values"
                title={values.title}
                headingClassName="[&>h2]:max-w-[20ch]"
                className="grid gap-7 pt-[110px]"
            >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4">
                    {values.cards.map((card) => (
                        <div
                            key={card.title}
                            className="grid content-start gap-2.5 rounded-[18px] border border-border bg-card p-[26px]"
                        >
                            <h3 className="m-0 font-display text-[20px] font-semibold tracking-[-0.02em]">
                                {card.title}
                            </h3>
                            <p className="m-0 text-[15.5px] leading-[1.55] text-mk-copy">
                                {card.body}
                            </p>
                        </div>
                    ))}
                </div>
            </Section>

            <Container
                as="section"
                aria-labelledby="about-where"
                className="grid justify-items-start gap-[14px] pt-[110px]"
            >
                <Eyebrow>{where.eyebrow}</Eyebrow>
                <h2
                    id="about-where"
                    className="m-0 font-display text-[clamp(30px,3.4vw,40px)] font-bold leading-[1.05] tracking-[-0.035em]"
                >
                    {where.title}
                </h2>
                <p className="m-0 max-w-[52ch] text-mk-body text-mk-copy [text-wrap:pretty]">
                    {where.body}
                </p>
                <div className="flex flex-wrap gap-x-[22px] gap-y-2.5 text-[15px] font-semibold">
                    {where.links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={textLinkClasses()}
                        >
                            {link.label}
                            <Arrow />
                        </Link>
                    ))}
                </div>
            </Container>

            <Container
                as="section"
                aria-label={company.nameLabel}
                className="pt-24"
            >
                <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-x-8 gap-y-5 border-t border-border pt-7 text-[15px] leading-[1.55] text-mk-copy">
                    <CompanyFact label={company.nameLabel}>
                        {company.madeBy(site.company)}
                    </CompanyFact>
                    <CompanyFact label={company.contactLabel}>
                        <Link href="/contact" className={textLinkClasses()}>
                            {company.contactLink}
                        </Link>
                    </CompanyFact>
                </dl>
            </Container>

            <Container className="pt-[110px]">
                <div className="flex flex-wrap items-end justify-between gap-8 rounded-mk-band bg-foreground p-mk-band text-background">
                    <h2 className="m-0 flex-[1_1_420px] font-display text-[clamp(36px,5vw,56px)] font-bold leading-none tracking-[-0.045em] [text-wrap:balance]">
                        {band.title}
                    </h2>
                    <div className="grid justify-items-start gap-3">
                        <ButtonLink
                            variant="saffron"
                            href={signupHref(page.type)}
                            data-cta="start-free-band"
                        >
                            Start free
                        </ButtonLink>
                        <span className="text-mk-note text-mk-on-ink-muted">
                            {band.note}
                        </span>
                    </div>
                </div>
            </Container>
        </div>
    );
}

/** "स  **sa**, with. As in सपरिवार, with the family." */
function NameLine({ part }: { part: (typeof ABOUT.meaning.parts)[number] }) {
    return (
        <>
            <span
                lang="hi"
                className={`${HINDI} text-[28px] font-bold text-background`}
            >
                {part.hi}
            </span>
            <span>
                <strong className="font-semibold text-background">
                    {part.roman}
                </strong>
                {part.means}
                <span lang="hi" className={HINDI}>
                    {part.example}
                </span>
                {part.gloss}
            </span>
        </>
    );
}

function CompanyFact({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="grid content-start gap-1">
            <dt className="font-semibold text-foreground">{label}</dt>
            <dd className="m-0">{children}</dd>
        </div>
    );
}
