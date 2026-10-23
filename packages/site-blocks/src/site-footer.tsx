import type { LookId } from "@saroh/block-contract";
import type { ReactNode } from "react";

import { CookieChoicesButton } from "./consent-banner";
import type { SiteSession } from "./look-chrome";
import { lookOf } from "./look-context";
import { LookFooter } from "./look-footer";
import type { SiteContact } from "./site-footer-contact";
import {
    FOOTER_LINK,
    FooterContact,
    hasFooterFacts,
} from "./site-footer-contact";
import type { SiteNavItem } from "./site-header-menu";
import type { ModulePageStates } from "./site-menu";
import { siteMenuEntries, underBasePath } from "./site-menu";
import type { SiteSeller } from "./sold-by";
import { SoldByBlock } from "./sold-by";

/**
 * The foot of every page. Shared, as the header is, by the live site, a
 * draft preview and the website editor's canvas (`site-chrome.tsx`).
 */

/**
 * How the footer's closing line is laid out. Absent is `centre`: the line
 * centred under the facts. `left` is the industry designs' row: the site's
 * name in its heading face, the merchant's line beside it, and the Saroh
 * credit (Free only) at the far end.
 */
export const FOOTER_LAYOUTS = ["centre", "left"] as const;
export type FooterLayout = (typeof FOOTER_LAYOUTS)[number];

/** What the merchant wrote at the foot of their site. */
export interface SiteFooterContent {
    format: "html" | "markdown";
    value: string;
    layout?: FooterLayout;
}

/** Where a footer line breaks into more than one line. */
const BLOCK_OR_BREAK =
    /<\/?(p|div|ul|ol|li|h[1-6]|blockquote|table|pre|hr|br)\b/i;

/**
 * A merchant's footer as one line, or `null` when it is more than that.
 *
 * On Free the footer ends in "Made with Saroh" (DEC-102), set after the
 * merchant's own line with a " · ", as the design draws it. That only works
 * for a line: plain text with no line break, or html that is a single
 * paragraph. Anything richer (two paragraphs, a list, a heading) keeps its
 * own block, and the credit goes on the line below it.
 *
 * The html branch hands back the paragraph's inner markup. Publish sanitized
 * the whole value, and a `<p>`'s contents are inline markup, so drawing them
 * inside a `<span>` is the same markup, one wrapper lighter.
 */
export function footerLine(
    footer: SiteFooterContent,
): { kind: "text" | "html"; value: string } | null {
    const value = footer.value.trim();
    if (footer.format !== "html") {
        return value.includes("\n") ? null : { kind: "text", value };
    }
    const inner = /^<p>([\s\S]*)<\/p>$/i.exec(value)?.[1];
    if (inner === undefined || BLOCK_OR_BREAK.test(inner)) return null;
    return { kind: "html", value: inner };
}

/**
 * The Saroh credit a Free site's footer carries (DEC-102): "Made with
 * Saroh", linking to saroh.in with the business's referral code (#812).
 * Paid plans have none, and a site drawn with none shows no Saroh credit.
 */
export interface SiteCredit {
    href: string;
    /**
     * "Report", beside the credit (DEC-121): where a customer reports the
     * business to Saroh (`reportBusinessHref`). Free only, as the credit is:
     * a paid site carries no Saroh link at all.
     */
    reportHref?: string | null;
}

/** Where "Made with Saroh" links: saroh.in with the business's code. */
export function madeWithSarohHref(referralCode: string): string {
    return `https://saroh.in/?ref=${encodeURIComponent(referralCode)}`;
}

/** The merchant's own footer block, when it is more than a line. */
const WRITTEN_PROSE =
    /* The merchant's footer text colour governs, not the prose defaults —
       the same reason richText overrides them: a chosen palette must not be
       repainted by a typography plugin's greys. */
    "prose prose-sm prose-headings:text-site-footer-fg prose-p:text-site-footer-fg prose-a:text-site-footer-fg prose-strong:text-site-footer-fg prose-li:text-site-footer-fg max-w-none";

/**
 * The foot of every page (#202, G17).
 *
 * TWO PARTS. First the facts someone scrolls down for, in columns
 * (`FooterContact`): where to find the business, each place with its
 * address, directions and its week by day; how to get in touch; and the
 * site's pages. Then the closing line: the merchant's own line, and on Free
 * "Made with Saroh" linking to saroh.in with the business's referral code
 * (DEC-102). Paid plans show no Saroh credit; the renderer reads the plan
 * and passes `credit` only for Free.
 *
 * The footer always renders, and is tidy with nothing set: no facts draws
 * no columns and no heading, only the closing line. With nothing written,
 * that line is the site's name, which the header already shows to everyone;
 * over the columns the name leads instead, in the site's heading face.
 *
 * `contact` (UX-038) is the business's PUBLIC place and phone: the same live
 * read the Visit us block and the booking header show (`/visit`, G8, DEC-053),
 * where Settings › Business calls the number "Phone on your website". Its
 * `email` is the business's contact email, shown when the business has added
 * one (DEC-101); Settings › Business says the site shows it. Its `places`
 * and `social` are where customers come and the business's social links
 * (DEC-128), from the public contact read; nothing is drawn for what isn't
 * set.
 *
 * `navigation`, `modules` and `shopServes` are the header's own, so the two
 * menus are worked out one way (`siteMenuEntries`). The footer lists every
 * page, the one the header's main button opens included.
 *
 * Everything is plain text in the site's own footer colours and type, never
 * Saroh's colours or font: a merchant's site does not wear the brand. The
 * merchant's Footer colour (#189) still paints the band. Text is the
 * footer's own colour at full strength throughout; only hairlines are
 * tinted, so no pairing is weaker than the one the palette checked.
 *
 * SAFETY. `value` is rendered with `dangerouslySetInnerHTML` when the format is
 * html, and that is safe for exactly one reason: publish sanitized it through
 * the same allowlist as `richText.value` before writing the immutable snapshot,
 * so what arrives here is already-cleaned markup. The editor's canvas passes a
 * draft footer the API sanitized the same way (`footerPreview`), so no caller
 * hands this raw author input. Markdown renders as escaped pre-wrapped text,
 * because there is no markdown library in this app's dependencies and
 * guessing at one would mean emitting HTML nobody cleaned.
 */
export function SiteFooter({
    footer,
    name,
    contact = null,
    credit = null,
    cookieChoices = false,
    seller = null,
    navigation = [],
    modules,
    shopServes = false,
    basePath = "",
    now,
    look,
    action = null,
    session = null,
}: {
    /**
     * The site's look (DEC-172, U5): Folio, Quiet and Live draw their own
     * footer (`look-footer.tsx`) with every fact this one has. Absent is
     * Classic, unchanged.
     */
    look?: LookId | null;
    /** The site's main action, an outline in a look's footer; Classic draws none. */
    action?: { label: string; href: string } | null;
    /** Who is signed in, for a look's "Your account" (drawn in the browser). */
    session?: SiteSession | null;
    footer: SiteFooterContent | null | undefined;
    /** The site's name: the footer's line when the merchant wrote none. */
    name: string;
    /** The business's public phone, place and email; null draws none. */
    contact?: SiteContact | null;
    /** "Made with Saroh" on Free (DEC-102); null shows no Saroh credit. */
    credit?: SiteCredit | null;
    /**
     * "Cookie choices", while a tracker the merchant connected asks the
     * visitor (DEC-108). Off draws nothing.
     */
    cookieChoices?: boolean;
    /**
     * "Sold by ‹legal name›" with the registered address (DEC-121), on
     * every plan, in the business's own details. The renderer passes it for
     * a published site; null draws none (the editor's canvas, the catalog).
     * Its email and phone are drawn only in the `left` layout while the
     * footer shows no contact of its own.
     */
    seller?: SiteSeller | null;
    /** The published menu, as the header takes it; none lists no pages. */
    navigation?: readonly SiteNavItem[];
    /** Whether each module page shows now (G15), as the header takes it. */
    modules?: ModulePageStates | null;
    /** `/shop` serves now (P4), as the header takes it. */
    shopServes?: boolean;
    /** Prefix for every link, "" on a live site (a draft preview's path). */
    basePath?: string;
    /** The moment today is marked for. Fixtures and tests pin it. */
    now?: Date;
}) {
    const written = footer && footer.value.trim() !== "" ? footer : null;
    const left = footer?.layout === "left";
    const menu = siteMenuEntries({ navigation, modules, shopServes }).map(
        (item) => ({
            label: item.label,
            href: underBasePath(basePath, item.href),
        }),
    );
    const facts = hasFooterFacts(contact, menu) ? (
        <FooterContact contact={contact} menu={menu} now={now} />
    ) : null;
    const owner = seller ? (
        <SoldByBlock
            seller={
                left
                    ? seller
                    : // The contact column above already shows these.
                      { ...seller, email: null, phone: null }
            }
            className={left ? "mt-3 text-left" : "mt-2"}
            linkClassName={FOOTER_LINK}
        />
    ) : null;
    const drawn = lookOf(look);
    if (drawn) {
        const one = written ? footerLine(written) : null;
        return (
            <LookFooter
                look={drawn}
                name={name}
                line={
                    one && one.value !== "" ? (
                        one.kind === "html" ? (
                            <span
                                // Sanitized at publish — see the safety note above.
                                dangerouslySetInnerHTML={{ __html: one.value }}
                            />
                        ) : (
                            one.value
                        )
                    ) : null
                }
                block={
                    written && one === null ? (
                        written.format === "html" ? (
                            <div
                                className={WRITTEN_PROSE}
                                // Sanitized at publish — see the safety note above.
                                dangerouslySetInnerHTML={{
                                    __html: written.value,
                                }}
                            />
                        ) : (
                            <p className="text-site-footer-muted m-0 whitespace-pre-wrap text-[15px]">
                                {written.value}
                            </p>
                        )
                    ) : null
                }
                action={
                    action
                        ? {
                              label: action.label,
                              href: underBasePath(basePath, action.href),
                          }
                        : null
                }
                contact={contact}
                menu={menu}
                session={session}
                basePath={basePath}
                closing={
                    credit ? (
                        <>
                            <MadeWithSaroh credit={credit} />
                            {credit.reportHref ? (
                                <ReportLink href={credit.reportHref} />
                            ) : null}
                        </>
                    ) : null
                }
                cookieChoices={cookieChoices}
                owner={owner}
            />
        );
    }
    if (left) {
        return (
            <LeftFooter
                written={written}
                name={name}
                facts={facts}
                credit={credit}
                cookieChoices={cookieChoices}
                owner={owner}
            />
        );
    }
    // Over the columns the name leads, so the closing line doesn't say it
    // again; with no columns it is the line, as it always was.
    const line = written
        ? footerLine(written)
        : facts
          ? null
          : { kind: "text" as const, value: name.trim() };
    const hasLine = line !== null && line.value !== "";
    const closing = hasLine || Boolean(credit) || cookieChoices;
    const block = written !== null && line === null;

    return (
        <footer
            data-site-footer=""
            className={`border-site-border bg-site-footer-bg text-site-footer-fg font-site-body w-full border-t pb-7 ${facts ? "pt-[var(--site-section-padding)]" : "pt-5"}`}
        >
            {/* The margins inside the column, as in the left layout below,
                so the footer lines up with the header and the page. */}
            <div className="max-w-site-content mx-auto px-5 sm:px-[var(--site-page-margin)]">
                {facts ? (
                    <div className="pb-9">
                        <p
                            data-site-footer-name=""
                            className="font-site-heading m-0 mb-7 text-balance text-[calc(1.375rem*var(--site-heading-scale,1))] font-semibold leading-tight tracking-[-0.02em]"
                        >
                            {name.trim()}
                        </p>
                        {facts}
                    </div>
                ) : null}
                <div
                    className={`text-center text-[12.5px] ${facts && (closing || block || owner) ? "border-site-footer-fg/20 border-t pt-5" : ""}`}
                >
                    {written && block ? (
                        written.format === "html" ? (
                            <div
                                className={`${WRITTEN_PROSE} mx-auto mb-3`}
                                // Sanitized at publish — see the safety note above.
                                dangerouslySetInnerHTML={{
                                    __html: written.value,
                                }}
                            />
                        ) : (
                            <p className="mb-3 whitespace-pre-wrap text-sm">
                                {written.value}
                            </p>
                        )
                    ) : null}
                    {closing ? (
                        <p>
                            {line && hasLine ? (
                                line.kind === "html" ? (
                                    <span
                                        // Sanitized at publish — see above.
                                        dangerouslySetInnerHTML={{
                                            __html: line.value,
                                        }}
                                    />
                                ) : (
                                    <span>{line.value}</span>
                                )
                            ) : null}
                            {hasLine && credit ? " · " : null}
                            {credit ? <MadeWithSaroh credit={credit} /> : null}
                            {credit?.reportHref ? (
                                <>
                                    {" · "}
                                    <ReportLink href={credit.reportHref} />
                                </>
                            ) : null}
                            {(hasLine || credit) && cookieChoices
                                ? " · "
                                : null}
                            {cookieChoices ? <CookieChoicesButton /> : null}
                        </p>
                    ) : null}
                    {owner}
                </div>
            </div>
        </footer>
    );
}

/**
 * "Made with Saroh" (DEC-102), in the footer's own colours and type, never
 * Saroh's: a merchant's site does not wear the brand.
 */
function MadeWithSaroh({
    credit,
    className = "",
}: {
    credit: SiteCredit;
    className?: string;
}) {
    return (
        <a
            href={credit.href}
            target="_blank"
            rel="noopener"
            className={[FOOTER_LINK, className].filter(Boolean).join(" ")}
        >
            Made with Saroh
        </a>
    );
}

/**
 * "Report" (DEC-121), beside the credit on Free: a customer's way to tell
 * Saroh about the business. In the footer's own colours, as the credit is.
 */
function ReportLink({ href }: { href: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener"
            aria-label="Report this business to Saroh"
            className={FOOTER_LINK}
        >
            Report
        </a>
    );
}

/**
 * The `left` footer — the designs' row (Bakery, Ceramics, Blogs): one row
 * on the page's column, its margins inside the column so it lines up with
 * the header and the sections, wrapping on a phone —
 * the name in the heading face, the merchant's line (an address, the days
 * they open), and on Free "Made with Saroh" pushed to the far end. The
 * facts sit in their columns above the row, which already carries the name.
 * A footer richer than a line keeps its own block above the row,
 * left-aligned too. The same safety note as {@link SiteFooter}: html
 * arrives sanitized.
 */
function LeftFooter({
    written,
    name,
    facts,
    credit,
    cookieChoices,
    owner,
}: {
    written: SiteFooterContent | null;
    name: string;
    /** The footer's columns (`FooterContact`); null when nothing is set. */
    facts: ReactNode;
    credit: SiteCredit | null;
    cookieChoices: boolean;
    /** "Sold by ‹legal name›", under the row (DEC-121); null draws none. */
    owner: ReactNode;
}) {
    const line = written ? footerLine(written) : null;
    return (
        <footer
            data-site-footer=""
            className={`border-site-border bg-site-footer-bg text-site-footer-fg font-site-body w-full border-t pb-12 ${facts ? "pt-[var(--site-section-padding)]" : "pt-6"}`}
        >
            {/* The margins inside the column, as the header and every
                section have them, so the name lines up with the page's
                left edge on a template's column (`--site-content-width`). */}
            <div className="max-w-site-content mx-auto px-5 sm:px-[var(--site-page-margin)]">
                {facts ? (
                    <div className="border-site-footer-fg/20 mb-6 border-b pb-9">
                        {facts}
                    </div>
                ) : null}
                {written && line === null ? (
                    written.format === "html" ? (
                        <div
                            className={`${WRITTEN_PROSE} mb-4`}
                            // Sanitized at publish — see SiteFooter.
                            dangerouslySetInnerHTML={{ __html: written.value }}
                        />
                    ) : (
                        <p className="mb-4 whitespace-pre-wrap text-sm">
                            {written.value}
                        </p>
                    )
                ) : null}
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[13.5px]">
                    <span className="font-site-heading text-base font-semibold tracking-[-0.02em]">
                        {name.trim()}
                    </span>
                    {line && line.value !== "" ? (
                        line.kind === "html" ? (
                            <span
                                // Sanitized at publish — see SiteFooter.
                                dangerouslySetInnerHTML={{ __html: line.value }}
                            />
                        ) : (
                            <span>{line.value}</span>
                        )
                    ) : null}
                    {cookieChoices ? (
                        <CookieChoicesButton className="ml-auto" />
                    ) : null}
                    {credit ? (
                        <MadeWithSaroh
                            credit={credit}
                            className={cookieChoices ? "" : "ml-auto"}
                        />
                    ) : null}
                    {credit?.reportHref ? (
                        <ReportLink href={credit.reportHref} />
                    ) : null}
                </div>
                {owner}
            </div>
        </footer>
    );
}
