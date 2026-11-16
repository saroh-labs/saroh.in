import Image from "next/image";

import { ABOUT } from "@/content/about";
import type { CompanyFacts } from "@/content/company";
import { COMPANY, founderNote, officeLine } from "@/content/company";
import { CONTACT_PAGE } from "@/content/contact-page";
import { drawnIn } from "@/content/launch-words";
import type { PublishContext } from "@/content/resources";
import { linkShown } from "@/content/resources";
import type { LaunchMode } from "@/lib/links";

import {
    AboutName,
    AboutValues,
    CompanyFact,
} from "@saroh/marketing/about-parts";
import { Container } from "@saroh/marketing/container";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { LinkRow, TextLink } from "@saroh/marketing/text-link";

import { PageHero } from "@saroh/marketing/page-hero";
import { CtaLink } from "../shared/buttons/cta-link";

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
            <PageHero
                crumbs={[{ name: ABOUT.eyebrow }]}
                title={ABOUT.title}
                mark="everything"
                lead={drawnIn(ABOUT.lead, mode)
                    .map((part) => part.text)
                    .join("")}
            />

            <AboutName meaning={meaning} />

            <AboutValues
                title={values.title}
                cards={drawnIn(values.cards, mode).map((card) => ({
                    title: card.title,
                    body:
                        mode === "open" && card.openBody
                            ? card.openBody
                            : card.body,
                }))}
            />

            <Container
                as="section"
                aria-labelledby="about-where"
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-12 pt-[72px] min-[760px]:pt-[120px]"
            >
                <div className="grid gap-5">
                    <h2
                        id="about-where"
                        className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                    >
                        {where.title[mode]}
                    </h2>
                    <p className="m-0 max-w-[52ch] text-[16px] leading-[1.6] text-mk-copy [text-wrap:pretty]">
                        {where.opens[mode]} {where.rest}
                    </p>
                    {links.length > 0 ? (
                        <LinkRow
                            links={links}
                            className="flex flex-wrap gap-x-6 text-[16px]"
                        />
                    ) : null}
                </div>
                {founder ? (
                    <div className="grid gap-4 rounded-mk-card border border-border bg-card p-7">
                        <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
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
                className="pt-[72px] min-[760px]:pt-[120px]"
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
                        <TextLink href={CONTACT_PAGE.href} tone="ink" arrow>
                            {ABOUT.company.contactLink}
                        </TextLink>
                    </CompanyFact>
                </dl>
            </Container>

            <ClosingCTA
                visual={null}
                id="about-start"
                className="mt-[72px] min-[760px]:mt-[120px]"
                title={band.title[mode]}
                primary={<CtaLink src="about-band" mode={mode} size="kit" />}
                note={band.note[mode]}
            />
        </>
    );
}
