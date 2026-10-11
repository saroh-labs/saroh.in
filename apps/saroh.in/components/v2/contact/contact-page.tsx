import Link from "next/link";

import type { CompanyFacts } from "@/content/company";
import { COMPANY, registrationLine } from "@/content/company";
import { SAROH_CONTACT_EMAIL } from "@/content/contact";
import { CONTACT_PAGE, socialText } from "@/content/contact-page";
import { drawnIn } from "@/content/launch-words";
import type { PublishContext } from "@/content/resources";
import { linkShown } from "@/content/resources";
import { SAROH_SOCIAL } from "@/content/social";
import { cn } from "@/lib/cn";
import type { LaunchMode } from "@/lib/links";

import { Arrow } from "../arrow";
import { Container } from "../container";
import { Eyebrow } from "../eyebrow";
import { ContactForm } from "./contact-form";

const RING =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

const TEXT_LINK = cn(
    "cursor-pointer rounded-sm text-brand-700 no-underline transition-colors duration-fast ease-out hover:text-foreground",
    RING,
);

/** The side column's white card. */
const SIDE_CARD =
    "grid rounded-mk-card border border-border bg-card px-[22px] py-5";

const SIDE_TITLE = "m-0 font-sans text-[16.5px] font-semibold text-foreground";

/**
 * /contact (design "Contact", DEC-137): the message form on the left; on
 * the right the way to Help and the changelog, the other ways to reach
 * Saroh and the registered office; then "Before you write".
 *
 * Help and the changelog are drawn only while their page is shown (`ctx`).
 * A company fact `content/company.ts` doesn't hold is not drawn: no Phone
 * row without a number, no registration line without a number, and no
 * office card with nothing to put in it. `mode` is the site's launch
 * switch: a question marked `openOnly` waits for it.
 */
export function ContactPage({
    mode,
    ctx,
    company = COMPANY,
}: {
    mode: LaunchMode;
    ctx: PublishContext;
    company?: CompanyFacts;
}) {
    const { help, changelog, ways, office, before } = CONTACT_PAGE;
    const social = ways.social.flatMap((label) => {
        const link = SAROH_SOCIAL.find((s) => s.label === label);
        return link ? [link] : [];
    });
    const lines = company.registeredOffice ?? [];
    const registration = registrationLine(company);
    const questions = drawnIn(before.items, mode);

    return (
        <>
            <Container
                as="header"
                className="grid justify-items-start gap-[18px] pt-[72px]"
            >
                <Eyebrow>{CONTACT_PAGE.eyebrow}</Eyebrow>
                <h1 className="m-0 max-w-[15ch] font-display text-mk-pricing-hero font-bold [text-wrap:balance]">
                    {CONTACT_PAGE.title}
                </h1>
                <p className="m-0 max-w-[56ch] text-mk-intro text-mk-copy [text-wrap:pretty]">
                    {CONTACT_PAGE.lead}
                </p>
            </Container>

            <Container
                as="section"
                aria-label={CONTACT_PAGE.name}
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-8 pt-16"
            >
                <div className="rounded-[20px] border border-border bg-card p-[clamp(22px,4vw,36px)]">
                    <ContactForm />
                </div>

                <div className="grid gap-[14px]">
                    {linkShown(help.href, ctx) ? (
                        <SideLink
                            href={help.href}
                            title={help.title}
                            body={help.body}
                        />
                    ) : null}
                    {linkShown(changelog.href, ctx) ? (
                        <SideLink
                            href={changelog.href}
                            title={changelog.title}
                            body={changelog.body}
                        />
                    ) : null}

                    <div className={cn(SIDE_CARD, "gap-3")}>
                        <h2 className={SIDE_TITLE}>{ways.title}</h2>
                        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-[18px] gap-y-2 text-[14.5px] leading-[1.5]">
                            <Way label={ways.email}>
                                <a
                                    href={`mailto:${SAROH_CONTACT_EMAIL}`}
                                    className={TEXT_LINK}
                                >
                                    {SAROH_CONTACT_EMAIL}
                                </a>
                            </Way>
                            {company.phone ? (
                                <Way label={ways.phone}>
                                    <a
                                        href={`tel:${company.phone.dial}`}
                                        className={TEXT_LINK}
                                    >
                                        {company.phone.display}
                                    </a>
                                    {company.phone.hours
                                        ? ` · ${company.phone.hours}`
                                        : null}
                                </Way>
                            ) : null}
                            {social.map((link) => (
                                <Way key={link.href} label={link.label}>
                                    <a
                                        href={link.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={TEXT_LINK}
                                    >
                                        {socialText(link.href)}
                                    </a>
                                </Way>
                            ))}
                        </dl>
                    </div>

                    {lines.length > 0 || registration ? (
                        <div className="grid gap-1.5 rounded-mk-card bg-muted px-[22px] py-5 text-[14.5px] leading-[1.55] text-mk-copy">
                            <h2 className="m-0 font-sans text-[14.5px] font-semibold leading-[1.55] text-foreground">
                                {office.title}
                            </h2>
                            <address className="not-italic">
                                {company.legalName}
                                {lines.map((line) => (
                                    <span key={line} className="block">
                                        {line}
                                    </span>
                                ))}
                            </address>
                            {registration ? <span>{registration}</span> : null}
                        </div>
                    ) : null}
                </div>
            </Container>

            {questions.length > 0 ? (
                <Container
                    as="section"
                    aria-labelledby="contact-before"
                    className="grid gap-[18px] pt-24"
                >
                    <h2
                        id="contact-before"
                        className="m-0 font-display text-mk-h2-xs font-bold"
                    >
                        {before.title}
                    </h2>
                    <div
                        className={cn(
                            "grid gap-3",
                            // The design draws three across. With fewer,
                            // each keeps a third's width rather than
                            // stretching across the page.
                            questions.length >= 3
                                ? "grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]"
                                : "grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))]",
                        )}
                    >
                        {questions.map((item) => (
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
                </Container>
            ) : null}
        </>
    );
}

/** A white card that is one link: its question, an arrow, and a line. */
function SideLink({
    href,
    title,
    body,
}: {
    href: string;
    title: string;
    body: string;
}) {
    return (
        <Link
            href={href}
            className={cn(
                SIDE_CARD,
                "cursor-pointer gap-1 text-foreground no-underline transition-colors duration-fast ease-out hover:border-foreground hover:text-foreground",
                RING,
            )}
        >
            <span className="text-[16.5px] font-semibold">
                {title}
                <Arrow />
            </span>
            <span className="text-[14.5px] leading-[1.5] text-mk-copy">
                {body}
            </span>
        </Link>
    );
}

function Way({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{children}</dd>
        </>
    );
}
