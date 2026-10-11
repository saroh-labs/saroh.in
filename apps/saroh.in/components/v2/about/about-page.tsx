import Image from "next/image";
import Link from "next/link";

import { ABOUT } from "@/content/about";
import type { CompanyFacts } from "@/content/company";
import { COMPANY, founderNote, officeLine } from "@/content/company";
import { CONTACT_PAGE } from "@/content/contact-page";
import { drawnIn } from "@/content/launch-words";
import type { PublishContext } from "@/content/resources";
import { linkShown } from "@/content/resources";
import type { LaunchMode } from "@/lib/links";

import { Arrow } from "../arrow";
import { Container } from "../container";
import { CtaLink } from "../cta-link";
import { Eyebrow } from "../eyebrow";

/** Noto Sans Devanagari, loaded by the route (`app/(v2)/about/page.tsx`). */
const HINDI = "font-[family-name:var(--font-devanagari)]";

const TEXT_LINK =
    "cursor-pointer rounded-sm text-brand-700 no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

/**
 * /about (design "About", DEC-137): the opening, what the name means on an
 * Ink band, what we hold ourselves to, where we are (with the founder's
 * note beside it once there is one), who makes Saroh, and the closing band.
 *
 * `mode` is the site's launch switch: before it opens nothing here names a
 * plan, a price or a limit, and the band asks for the waitlist
 * (`content/about.ts`). `company` is `content/company.ts`: a fact it doesn't
 * hold is not drawn, so the founder's card and the registered office appear
 * only once they are set. A link to a Resources page is drawn only while
 * that page is shown (`ctx`).
 */
export function AboutPage({
    mode,
    ctx,
    company = COMPANY,
}: {
    mode: LaunchMode;
    ctx: PublishContext;
    company?: CompanyFacts;
}) {
    const founder = founderNote(company);
    const office = officeLine(company);
    const links = ABOUT.where.links.filter((link) => linkShown(link.href, ctx));
    const { meaning, values, where, band } = ABOUT;

    return (
        <>
            <Container
                as="header"
                className="grid justify-items-start gap-[18px] pt-[72px]"
            >
                <Eyebrow>{ABOUT.eyebrow}</Eyebrow>
                <h1 className="m-0 max-w-[17ch] font-display text-mk-pricing-hero font-bold [text-wrap:balance]">
                    {ABOUT.title}
                </h1>
                <p className="m-0 max-w-[60ch] text-mk-intro text-mk-copy [text-wrap:pretty]">
                    {drawnIn(ABOUT.lead, mode)
                        .map((part) => part.text)
                        .join("")}
                </p>
            </Container>

            <Container
                as="section"
                aria-labelledby="about-name"
                className="pt-24"
            >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-10 rounded-mk-band bg-foreground p-[clamp(32px,6vw,72px)] text-background">
                    <div className="grid gap-[14px]">
                        <h2
                            id="about-name"
                            className="m-0 font-sans text-mk-eyebrow font-semibold uppercase text-mk-on-ink-muted"
                        >
                            {meaning.eyebrow}
                        </h2>
                        <div className="flex items-end gap-2.5">
                            <span
                                lang="hi"
                                // The design's clamp(72px, 10vw, 120px); under about
                                // 343px wide it eases down so the word and its
                                // dot stay inside the band.
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

            <Container
                as="section"
                aria-labelledby="about-values"
                className="grid gap-7 pt-[110px]"
            >
                <h2
                    id="about-values"
                    className="m-0 max-w-[20ch] font-display text-mk-h2-sm font-bold"
                >
                    {values.title}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4">
                    {drawnIn(values.cards, mode).map((card) => (
                        <div
                            key={card.title}
                            className="grid content-start gap-2.5 rounded-[18px] border border-border bg-card p-[26px]"
                        >
                            <h3 className="m-0 font-display text-[20px] font-semibold tracking-[-0.02em]">
                                {card.title}
                            </h3>
                            <p className="m-0 text-[15.5px] leading-[1.55] text-mk-copy">
                                {mode === "open" && card.openBody
                                    ? card.openBody
                                    : card.body}
                            </p>
                        </div>
                    ))}
                </div>
            </Container>

            <Container
                as="section"
                aria-labelledby="about-where"
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-12 pt-[110px]"
            >
                <div className="grid gap-[14px]">
                    <Eyebrow>{where.eyebrow}</Eyebrow>
                    <h2
                        id="about-where"
                        className="m-0 font-display text-[clamp(30px,3.4vw,40px)] font-bold leading-[1.05] tracking-[-0.035em]"
                    >
                        {where.title}
                    </h2>
                    <p className="m-0 max-w-[52ch] text-mk-body text-mk-copy [text-wrap:pretty]">
                        {where.opens[mode]} {where.rest}
                    </p>
                    {links.length > 0 ? (
                        <div className="flex flex-wrap gap-x-[22px] gap-y-2.5 text-[15px] font-semibold">
                            {links.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={TEXT_LINK}
                                >
                                    {link.label}
                                    <Arrow />
                                </Link>
                            ))}
                        </div>
                    ) : null}
                </div>
                {founder ? (
                    <div className="grid gap-4 rounded-[18px] border border-border bg-card p-7">
                        <h3 className="m-0 font-sans text-mk-eyebrow font-semibold uppercase text-muted-foreground">
                            {ABOUT.founder.eyebrow}
                        </h3>
                        {founder.note.map((paragraph) => (
                            <p
                                key={paragraph}
                                className="m-0 text-[17px] leading-[1.65] text-foreground [text-wrap:pretty]"
                            >
                                {paragraph}
                            </p>
                        ))}
                        <div className="flex items-center gap-[14px] border-t border-mk-line-soft pt-4">
                            {founder.photo ? (
                                <Image
                                    src={founder.photo.src}
                                    alt={founder.photo.alt}
                                    width={52}
                                    height={52}
                                    className="size-[52px] flex-none rounded-full object-cover"
                                />
                            ) : null}
                            <div className="grid gap-0.5">
                                <span className="text-[15.5px] font-semibold">
                                    {founder.name}
                                </span>
                                <span className="text-[14px] text-muted-foreground">
                                    {ABOUT.founder.role}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : null}
            </Container>

            <Container
                as="section"
                aria-label={ABOUT.company.nameLabel}
                className="pt-24"
            >
                <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-x-8 gap-y-5 border-t border-border pt-7 text-[15px] leading-[1.55] text-mk-copy">
                    <CompanyFact label={ABOUT.company.nameLabel}>
                        {ABOUT.company.madeBy(company.legalName)}
                    </CompanyFact>
                    {office ? (
                        <CompanyFact label={ABOUT.company.officeLabel}>
                            {office}
                        </CompanyFact>
                    ) : null}
                    <CompanyFact label={ABOUT.company.contactLabel}>
                        <Link href={CONTACT_PAGE.href} className={TEXT_LINK}>
                            {ABOUT.company.contactLink}
                        </Link>
                    </CompanyFact>
                </dl>
            </Container>

            <Container className="pt-[110px]">
                <div className="flex flex-wrap items-end justify-between gap-8 rounded-mk-band bg-foreground p-mk-band text-background">
                    <h2 className="m-0 flex-[1_1_420px] font-display text-[clamp(36px,5vw,56px)] font-bold leading-none tracking-[-0.045em] [text-wrap:balance]">
                        {band.title[mode]}
                    </h2>
                    <div className="grid justify-items-start gap-3">
                        <CtaLink
                            src="about-band"
                            mode={mode}
                            variant="saffron"
                        />
                        <span className="text-mk-note text-mk-on-ink-muted">
                            {band.note[mode]}
                        </span>
                    </div>
                </div>
            </Container>
        </>
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
    children: React.ReactNode;
}) {
    return (
        // `content-start`: a cell beside a taller one (a three-line address)
        // keeps its words right under its label, not spread down the cell.
        <div className="grid content-start gap-1">
            <dt className="font-semibold text-foreground">{label}</dt>
            <dd className="m-0">{children}</dd>
        </div>
    );
}
