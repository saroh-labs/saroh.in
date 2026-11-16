import {
    AboutName,
    AboutValues,
    CompanyFact,
} from "@saroh/marketing/about-parts";
import { Arrow } from "@saroh/marketing/arrow";
import { Container } from "@saroh/marketing/container";
import { PageHero } from "@saroh/marketing/page-hero";
import { textLinkClasses } from "@saroh/marketing/text-link";
import localFont from "next/font/local";
import Link from "next/link";

import { Closing } from "@/components/shared/closing";
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

export default function Page() {
    const { meaning, values, where, company, band } = ABOUT;
    return (
        <div data-page-type={page.type} className={devanagari.variable}>
            <JsonLd data={pageSchema(page)} />
            <PageHero
                crumbs={[{ name: ABOUT.eyebrow }]}
                title={ABOUT.title}
                mark="everything"
                lead={ABOUT.lead}
            />

            <AboutName meaning={meaning} />

            <AboutValues title={values.title} cards={values.cards} />

            <Container
                as="section"
                aria-labelledby="about-where"
                className="grid justify-items-start gap-5 pt-[72px] min-[760px]:pt-[120px]"
            >
                <h2
                    id="about-where"
                    className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                >
                    {where.title}
                </h2>
                <p className="m-0 max-w-[52ch] text-[16px] leading-[1.6] text-mk-copy [text-wrap:pretty]">
                    {where.body}
                </p>
                <div className="flex flex-wrap gap-x-6 text-[16px]">
                    {where.links.map((link) => (
                        <Link
                            key={link.href}
                            prefetch={false}
                            href={link.href}
                            className={textLinkClasses({ tone: "ink" })}
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
                className="pt-[72px] min-[760px]:pt-[120px]"
            >
                <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-x-8 gap-y-5 border-t border-border pt-7 text-[15px] leading-[1.55] text-mk-copy">
                    <CompanyFact label={company.nameLabel}>
                        {company.madeBy(site.company)}
                    </CompanyFact>
                    <CompanyFact label={company.contactLabel}>
                        <Link
                            prefetch={false}
                            href="/contact"
                            className={textLinkClasses({ tone: "ink" })}
                        >
                            {company.contactLink}
                            <Arrow />
                        </Link>
                    </CompanyFact>
                </dl>
            </Container>

            <Closing
                id="about-start"
                title={band.title}
                href={signupHref(page.type)}
                note={band.note}
            />
        </div>
    );
}
