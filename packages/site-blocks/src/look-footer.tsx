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
    { footer: string; lead: string; name: string; closing: string }
> = {
    folio: {
        footer: "pt-14 pb-8 min-[700px]:pt-24 min-[700px]:pb-10",
        lead: "grid justify-items-start gap-3 pb-10 min-[700px]:pb-14",
        name: "text-[44px] font-light leading-[0.95] tracking-[-0.035em] min-[700px]:text-[72px]",
        closing: "mt-10 min-[700px]:mt-[72px] justify-between",
    },
    quiet: {
        footer: "pt-[72px] pb-8 min-[700px]:pt-[120px] min-[700px]:pb-10",
        lead: "grid justify-items-center gap-5 pb-12 text-center min-[700px]:pb-[72px]",
        name: "text-[42px] font-normal leading-none min-[700px]:text-[64px] min-[700px]:font-light",
        closing:
            "mt-14 min-[700px]:mt-24 justify-center text-center min-[700px]:justify-between",
    },
    live: {
        footer: "pt-10 pb-8 min-[700px]:pt-14 min-[700px]:pb-10",
        lead: "grid justify-items-start gap-4 pb-10",
        name: "text-[64px] font-extrabold leading-[0.85] tracking-[-0.05em] [font-stretch:80%] min-[700px]:text-[96px]",
        closing: "mt-10 min-[700px]:mt-14 justify-between",
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
    const account = (
        <FooterSessionLinks
            session={session}
            basePath={basePath}
            headingClassName={lookFooterClasses.heading}
            linkClassName={lookFooterClasses.link}
        />
    );
    const facts = hasFooterFacts(contact, menu) ? (
        <FooterContact
            contact={contact}
            menu={menu}
            look={look}
            trailing={account}
        />
    ) : (
        // No facts: Your account still has its column.
        <div
            className={
                look === "quiet" ? "grid justify-items-center text-center" : ""
            }
        >
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
                <div className={style.lead}>
                    <p
                        data-site-footer-name=""
                        className={`font-site-heading m-0 text-balance [font-variant-numeric:lining-nums] ${style.name}`}
                    >
                        {name.trim()}
                    </p>
                    {line ? (
                        <p className="text-site-footer-muted m-0 max-w-[40ch] text-[15px] leading-relaxed">
                            {line}
                        </p>
                    ) : null}
                    {block}
                    {action ? (
                        <Link
                            href={action.href}
                            className={`border-site-footer-fg text-site-footer-fg rounded-site focus-visible:ring-site-footer-fg focus-visible:ring-offset-site-footer-bg mt-2 inline-flex h-[52px] cursor-pointer items-center justify-center whitespace-nowrap border bg-transparent px-[26px] text-[15px] font-semibold tracking-[0.02em] transition-opacity duration-[var(--site-motion-base,140ms)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-70`}
                        >
                            {action.label}
                        </Link>
                    ) : null}
                </div>
                <div id={VISIT_US_ID} className="scroll-mt-6">
                    {facts}
                </div>
                <div
                    className={`border-site-footer-fg/20 text-site-footer-muted flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-5 text-[13px] ${style.closing} ${CLOSING_TARGETS}`}
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
