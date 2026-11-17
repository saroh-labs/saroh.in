import { Arrow } from "@saroh/marketing/arrow";
import { cardLinkClasses } from "@saroh/marketing/card-link";
import { Container } from "@saroh/marketing/container";
import { PageHero } from "@saroh/marketing/page-hero";
import { Section } from "@saroh/marketing/section";
import Link from "next/link";
import { Fragment } from "react";

import { ContactForm } from "@/components/contact/contact-form";
import { JsonLd } from "@/components/shared/json-ld";
import { CONTACT, REGISTERED_OFFICE, SUPPORT_EMAIL } from "@/content/contact";
import { SAROH_SOCIAL } from "@/content/social";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { site } from "@/site.config";
import { textLinkClasses } from "@saroh/marketing/text-link";

const page = pageOf("/contact");

const SIDE_TITLE = "m-0 font-display text-mk-kit-h3 font-bold text-foreground";

export const metadata = pageMetadata(page);

/** saroh.in's Contact: the form on the left; on the right the ways to help yourself, the other ways to reach us and the registered office. */
export default function ContactPage() {
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <PageHero
                crumbs={[{ name: CONTACT.eyebrow }]}
                title={page.h1}
                lead={CONTACT.lead}
            />

            <Container
                as="section"
                aria-label={CONTACT.eyebrow}
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-8"
            >
                <div className="rounded-mk-card border border-border bg-card p-[clamp(20px,4vw,36px)]">
                    {/* Always Global's address: the API files the message under the edition of the address it came through. */}
                    <ContactForm apiUrl={site.apiUrl} />
                </div>
                <div className="grid gap-[14px]">
                    {CONTACT.side.map((card) => (
                        <Link
                            key={card.href}
                            prefetch={false}
                            href={card.href}
                            className={cardLinkClasses("gap-1 px-[22px] py-5")}
                        >
                            <span className="font-display text-mk-kit-h3 font-bold">
                                {card.title}
                                <Arrow />
                            </span>
                            <span className="text-[15px] leading-[1.55] text-mk-copy">
                                {card.body}
                            </span>
                        </Link>
                    ))}
                    <div className="grid gap-3 rounded-mk-card border border-border bg-card px-[22px] py-5">
                        <h2 className={SIDE_TITLE}>{CONTACT.ways.title}</h2>
                        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-[18px] gap-y-1 text-[15px] leading-[1.5]">
                            <dt className="text-muted-foreground">
                                {CONTACT.ways.email}
                            </dt>
                            <dd className="m-0">
                                <a
                                    href={`mailto:${SUPPORT_EMAIL}`}
                                    className={textLinkClasses({ tone: "ink" })}
                                >
                                    {SUPPORT_EMAIL}
                                </a>
                            </dd>
                            {SAROH_SOCIAL.filter((s) =>
                                CONTACT.ways.social.includes(s.label),
                            ).map((s) => (
                                <Fragment key={s.href}>
                                    <dt className="text-muted-foreground">
                                        {s.label}
                                    </dt>
                                    <dd className="m-0">
                                        <a
                                            href={s.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={textLinkClasses({
                                                tone: "ink",
                                            })}
                                        >
                                            {s.href.replace(
                                                /^https:\/\/(www\.)?/,
                                                "",
                                            )}
                                        </a>
                                    </dd>
                                </Fragment>
                            ))}
                        </dl>
                    </div>
                    <div className="grid gap-1.5 rounded-mk-card bg-muted px-[22px] py-5 text-[14.5px] leading-[1.55] text-mk-copy">
                        <h2 className={SIDE_TITLE}>{CONTACT.office.title}</h2>
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
                size="kit-h2"
                space="kit"
                className="grid gap-10"
            >
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3">
                    {CONTACT.before.items.map((item) => (
                        <div
                            key={item.q}
                            className="grid content-start gap-1.5 rounded-mk-card border border-border bg-card p-5"
                        >
                            <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                {item.q}
                            </h3>
                            <p className="m-0 text-[16px] leading-[1.6] text-mk-copy">
                                {item.a}
                            </p>
                        </div>
                    ))}
                </div>
            </Section>
        </div>
    );
}
