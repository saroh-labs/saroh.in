import { Arrow } from "@saroh/marketing/arrow";
import { cardLinkClasses } from "@saroh/marketing/card-link";
import { Container } from "@saroh/marketing/container";
import { Eyebrow } from "@saroh/marketing/eyebrow";
import Link from "next/link";

import { ContactForm } from "@/components/contact/contact-form";
import { JsonLd } from "@/components/shared/json-ld";
import { CONTACT } from "@/content/contact";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { site } from "@/site.config";

const page = pageOf("/contact");

export const metadata = pageMetadata(page);

/** saroh.in's Contact: the form on the left, the ways to help yourself on the right. */
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
                </div>
            </Container>
        </div>
    );
}
