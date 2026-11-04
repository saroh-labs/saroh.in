import { Arrow } from "@saroh/marketing/arrow";
import { cardLinkClasses } from "@saroh/marketing/card-link";
import { Container } from "@saroh/marketing/container";
import { Eyebrow } from "@saroh/marketing/eyebrow";
import { Section } from "@saroh/marketing/section";
import Link from "next/link";

import { ContactForm } from "@/components/contact/contact-form";
import { JsonLd } from "@/components/shared/json-ld";
import { CONTACT, REGISTERED_OFFICE, SUPPORT_EMAIL } from "@/content/contact";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { site } from "@/site.config";
import { textLinkClasses } from "@saroh/marketing/text-link";

const page = pageOf("/contact");

export const metadata = pageMetadata(page);

/** saroh.in's Contact: the form on the left; on the right the ways to help yourself, the other ways to reach us and the registered office. */
export default function ContactPage() {
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <Container
                as="header"
                className="grid justify-items-start gap-[18px] pt-[72px]"
            >
                <Eyebrow>{CONTACT.eyebrow}</Eyebrow>
                <h1 className="m-0 max-w-[15ch] font-display text-mk-pricing-hero font-bold [text-wrap:balance]">
                    {page.h1}
                </h1>
                <p className="m-0 max-w-[56ch] text-mk-intro text-mk-copy [text-wrap:pretty]">
                    {CONTACT.lead}
                </p>
            </Container>

            <Container
                as="section"
                aria-label={CONTACT.eyebrow}
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-8 pt-16"
            >
                <div className="rounded-[20px] border border-border bg-card p-[clamp(22px,4vw,36px)]">
                    {/* Always Global's address: the API files the message under the edition of the address it came through. */}
                    <ContactForm apiUrl={site.apiUrl} />
                </div>
                <div className="grid gap-[14px]">
                    {CONTACT.side.map((card) => (
                        <Link
                            key={card.href}
                            href={card.href}
                            className={cardLinkClasses("gap-1 px-[22px] py-5")}
                        >
                            <span className="text-[16.5px] font-semibold">
                                {card.title}
                                <Arrow />
                            </span>
                            <span className="text-[14.5px] leading-[1.5] text-mk-copy">
                                {card.body}
                            </span>
                        </Link>
                    ))}
                    <div className="grid gap-3 rounded-mk-card border border-border bg-card px-[22px] py-5">
                        <h2 className="m-0 font-sans text-[16.5px] font-semibold text-foreground">
                            {CONTACT.ways.title}
                        </h2>
                        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-[18px] gap-y-2 text-[14.5px] leading-[1.5]">
                            <dt className="text-muted-foreground">
                                {CONTACT.ways.email}
                            </dt>
                            <dd className="m-0">
                                <a
                                    href={`mailto:${SUPPORT_EMAIL}`}
                                    className={textLinkClasses()}
                                >
                                    {SUPPORT_EMAIL}
                                </a>
                            </dd>
                        </dl>
                    </div>
                    <div className="grid gap-1.5 rounded-mk-card bg-muted px-[22px] py-5 text-[14.5px] leading-[1.55] text-mk-copy">
                        <h2 className="m-0 font-sans text-[14.5px] font-semibold leading-[1.55] text-foreground">
                            {CONTACT.office.title}
                        </h2>
                        <address className="not-italic">
                            {site.company}
                            {REGISTERED_OFFICE.map((line) => (
                                <span key={line} className="block">
                                    {line}
                                </span>
                            ))}
                        </address>
                    </div>
                </div>
            </Container>

            <Section
                titleId="contact-before"
                title={CONTACT.before.title}
                size="sm"
                className="grid gap-[18px] pt-24"
            >
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3">
                    {CONTACT.before.items.map((item) => (
                        <div
                            key={item.q}
                            className="grid content-start gap-1.5 rounded-[14px] border border-border bg-card px-5 py-[18px]"
                        >
                            <h3 className="m-0 font-sans text-[15.5px] font-semibold">
                                {item.q}
                            </h3>
                            <p className="m-0 text-[14.5px] leading-[1.55] text-mk-copy">
                                {item.a}
                            </p>
                        </div>
                    ))}
                </div>
            </Section>
        </div>
    );
}
