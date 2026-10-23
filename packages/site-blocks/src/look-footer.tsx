import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import type { ReactNode } from "react";

import { CookieChoicesButton } from "./consent-banner";
import { FooterSessionLinks } from "./footer-session-links";
import type { SiteSession } from "./look-chrome";
import { VISIT_US_ID } from "./look-chrome";
import type { SiteContact } from "./site-footer-contact";
import {
    FooterContact,
    hasFooterFacts,
    lookFooterClasses,
} from "./site-footer-contact";
import type { SiteNavItem } from "./site-header-menu";

/**
 * The foot of every page under a look (DEC-172, plan U5, #1092), as the
 * fixed 01 Home boards draw it, desk and phone:
 *
 * - **Folio**: the name large in the display face with the business's own
 *   line under it and an outline Book; then the facts in columns (Find us
 *   with directions and the week, Get in touch, Pages, Your account); then
 *   the closing row on a hairline.
 * - **Quiet**: the same, centred, in the warm footer band.
 * - **Live**: the name heavy and huge, the columns beside it on a desk.
 *
 * Every capability of Classic's footer stays: the places with directions
 * and their weeks, Call, the business's own WhatsApp chat link (DEC-172),
 * email and social links, the pages, the merchant's own words, "Sold by"
 * with the registered address, Cookie choices, and on Free "Made with
 * Saroh" with Report. What a look adds: its Book as an OUTLINE (the view's
 * filled button is the page's own, or the bar's), "Your account" read in
 * the browser so a cached page names no one (`footer-session-links.tsx`),
 * and every link a 44px row.
 *
 * The footer's facts carry `id="site-visit"`: the header's "Visit us"
 * lands here on every page.
 */

const LOOK: Record<
    LookId,
    {
        footer: string;
        lead: string;
        name: string;
        closing: string;
        rule: string;
        button: string;
    }
> = {
    // VA: the name block is the first of the columns (2fr), spanning both
    // columns on a phone.
    folio: {
        footer: "pt-14 pb-8 min-[700px]:pt-24 min-[700px]:pb-10",
        lead: "order-first col-span-full grid content-start justify-items-start gap-3 min-[700px]:col-span-1",
        name: "text-[44px] font-light leading-[0.95] tracking-[-0.035em] min-[700px]:text-[72px]",
        closing: "mt-10 min-[700px]:mt-[72px] justify-between",
        rule: "border-site-footer-fg/20",
        button: "px-[26px] font-semibold",
    },
    // VD: centred; the columns 72px under the name, the closing rule the
    // page's own hairline.
    quiet: {
        footer: "pt-[72px] pb-8 min-[700px]:pt-[120px] min-[700px]:pb-10",
        lead: "grid justify-items-center gap-5 pb-12 text-center min-[700px]:pb-[72px]",
        name: "text-[42px] font-normal leading-none min-[700px]:text-[64px] min-[700px]:font-light",
        closing:
            "mt-14 min-[700px]:mt-24 justify-center text-center min-[700px]:justify-between",
        rule: "border-site-border",
        button: "px-[30px] font-medium",
    },
    // VB: the name and its line on the left, the columns beside it; no
    // Book (the dock and the page carry it); room under for the dock.
    live: {
        footer: "mt-14 pt-10 pb-[120px] min-[700px]:mt-[88px] min-[700px]:pt-14 min-[700px]:pb-10",
        lead: "grid content-start justify-items-start gap-4 pb-10 min-[700px]:pb-0",
        name: "text-[64px] font-extrabold leading-[0.85] tracking-[-0.05em] [font-stretch:80%] min-[700px]:text-[96px]",
        closing: "mt-10 min-[700px]:mt-14 justify-between",
        rule: "border-site-footer-fg/15",
        button: "",
    },
};

/** The closing row's links and buttons, held to 44px rows. */
const CLOSING_TARGETS =
    "[&_a]:inline-flex [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:items-center [&_button]:min-h-11 [&_button]:min-w-11";

export function LookFooter({
    look,
    name,
    line,
    block,
    action,
    contact,
    menu,
    session,
    basePath,
    closing,
    cookieChoices,
    owner,
}: {
    look: LookId;
    name: string;
    /** The merchant's own line under the name, already as markup or text. */
    line: ReactNode;
    /** The merchant's own words when they are more than a line. */
    block: ReactNode;
    /** The site's main action, drawn as an outline here; none draws none. */
    action: { label: string; href: string } | null;
    contact: SiteContact | null;
    menu: SiteNavItem[];
    session: SiteSession | null;
    basePath: string;
    /** "Made with Saroh" and Report on Free, as Classic's footer draws them. */
    closing: ReactNode;
    cookieChoices: boolean;
    /** "Sold by ‹legal name›" (DEC-121); null draws none. */
    owner: ReactNode;
}) {
    const style = LOOK[look];
    const classes = lookFooterClasses(look);
    const account = (
        <FooterSessionLinks
            session={session}
            basePath={basePath}
            headingClassName={classes.heading}
            linkClassName={classes.link}
        />
    );
    const lead = (
        <div className={style.lead}>
            <p
                data-site-footer-name=""
                className={`font-site-heading m-0 text-balance [font-variant-numeric:lining-nums] ${style.name}`}
            >
                {name.trim()}
            </p>
            {line ? (
                <p
                    className={`text-site-footer-muted m-0 text-[15px] leading-relaxed ${look === "live" ? "max-w-[360px]" : "max-w-[40ch]"}`}
                >
                    {line}
                </p>
            ) : null}
            {block}
            {action && look !== "live" ? (
                <Link
                    href={action.href}
                    className={`border-site-footer-fg text-site-footer-fg rounded-site focus-visible:ring-site-footer-fg focus-visible:ring-offset-site-footer-bg mt-2 inline-flex h-[52px] cursor-pointer items-center justify-center whitespace-nowrap border bg-transparent text-[15px] tracking-[0.02em] transition-opacity duration-[var(--site-motion-base,140ms)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-70 ${style.button}`}
                >
                    {action.label}
                </Link>
            ) : null}
        </div>
    );
    const folio = look === "folio";
    const facts = hasFooterFacts(contact, menu) ? (
        <FooterContact
            contact={contact}
            menu={menu}
            look={look}
            leading={folio ? lead : null}
            trailing={account}
        />
    ) : (
        // No facts: Your account still has its column.
        <div
            className={
                look === "quiet"
                    ? "grid justify-items-center text-center"
                    : "grid gap-8 min-[700px]:grid-cols-[2fr_1fr]"
            }
        >
            {folio ? lead : null}
            {account}
        </div>
    );
    return (
        <footer
            data-site-footer=""
            data-site-look-footer={look}
            className={`bg-site-footer-bg text-site-footer-fg font-site-body w-full ${style.footer}`}
        >
            <div className="max-w-site-content mx-auto px-5 min-[700px]:px-[var(--site-page-margin)]">
                {look === "live" ? (
                    <div className="min-[700px]:flex min-[700px]:items-start min-[700px]:justify-between min-[700px]:gap-4">
                        {lead}
                        <div id={VISIT_US_ID} className="scroll-mt-6">
                            {facts}
                        </div>
                    </div>
                ) : (
                    <>
                        {folio ? null : lead}
                        <div id={VISIT_US_ID} className="scroll-mt-6">
                            {facts}
                        </div>
                    </>
                )}
                <div
                    className={`${style.rule} text-site-footer-muted flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-5 text-[13px] ${style.closing} ${CLOSING_TARGETS}`}
                >
                    <span className="flex flex-wrap items-center gap-x-5">
                        {closing}
                    </span>
                    {cookieChoices ? (
                        <CookieChoicesButton className="text-site-footer-fg" />
                    ) : null}
                </div>
                {owner ? (
                    <div
                        className={`text-site-footer-fg text-[13px] ${look === "quiet" ? "text-center" : ""} ${CLOSING_TARGETS}`}
                    >
                        {owner}
                    </div>
                ) : null}
            </div>
        </footer>
    );
}
