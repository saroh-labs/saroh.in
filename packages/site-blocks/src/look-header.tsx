import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import type { ReactNode } from "react";

import { siteImage } from "./lib/site-image";
import type { SiteSession } from "./look-chrome";
import { withVisitUs } from "./look-chrome";
import { LOOK_RING, LookActionLink, LookNavRow } from "./look-header-parts";
import type { LookMenuFacts } from "./look-menu";
import { LookMenu } from "./look-menu";
import { reachOf } from "./reach-links";
import type { SiteContact } from "./site-footer-contact";
import { hasFooterFacts, shownContact } from "./site-footer-contact";
import type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";

/**
 * The site's header under a look (DEC-172, plan U5, #1092), as the fixed
 * boards draw it (VAHeader, VDHeader, VBHeader and the 01 Home boards,
 * desk and phone):
 *
 * - **Folio**: the name on the left in the display face, the menu centred,
 *   Sign in and an outline Book on the right, an ink hairline under it all.
 *   On a phone, the name and the menu button.
 * - **Quiet**: the menu on the left, the name centred, Sign in and an
 *   outline Book (a pill) on the right, no rule. On a phone, the menu
 *   button first, the name centred, Book on the right.
 * - **Live**: the name, the menu as pills in a white band, Sign in and Book
 *   as outline pills. On a phone, the name, Sign in and the menu button;
 *   the dock carries Book.
 *
 * Every look's header holds the bag (with its count) wherever the site
 * takes orders, "Visit us" in its menu, and a main button that is an
 * outline until the page's own has scrolled away (`look-header-parts`).
 * On a phone it scrolls away with the page, so the Book bar or the dock is
 * the one fixed bar; from 700px up it stays at the top.
 *
 * Every control is at least 44px on every pointer: the bag and the account
 * entry are the site's own (`ShopBag`, `AccountEntry`), held to it here.
 */

/** The bag's and the account's own controls, held to 44px under a look. */
const SLOT =
    "contents [&_a]:min-h-11 [&_a]:min-w-11 [&_button]:min-h-11 [&_button]:min-w-11";

const HEADER: Record<
    LookId,
    { header: string; row: string; name: string; actions: string }
> = {
    folio: {
        header: "border-site-border border-b",
        row: "grid-cols-[minmax(0,1fr)_auto] gap-2 py-2.5 pl-5 pr-3 min-[700px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[700px]:gap-8 min-[700px]:px-[var(--site-page-margin)] min-[700px]:py-5",
        name: "text-[22px] font-light tracking-[-0.015em] min-[700px]:text-[26px]",
        actions: "gap-1 min-[700px]:gap-[18px]",
    },
    quiet: {
        header: "",
        row: "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1 py-2.5 pl-3 pr-4 min-[700px]:gap-8 min-[700px]:px-[var(--site-page-margin)] min-[700px]:py-[22px]",
        name: "justify-center text-2xl font-medium tracking-[0.01em] min-[700px]:text-[30px]",
        actions: "gap-0.5 min-[700px]:gap-[22px]",
    },
    live: {
        header: "",
        row: "grid-cols-[minmax(0,1fr)_auto] gap-2.5 px-4 py-2.5 min-[700px]:min-h-[84px] min-[700px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[700px]:gap-6 min-[700px]:px-[var(--site-page-margin)]",
        name: "text-2xl font-extrabold leading-none tracking-[-0.035em] [font-stretch:80%] min-[700px]:text-[28px]",
        actions: "gap-1.5 min-[700px]:gap-3",
    },
};

/** The facts the phone menu says, from the footer's contact. */
export function lookMenuFacts(
    contact: SiteContact | null | undefined,
): LookMenuFacts | null {
    if (!contact) return null;
    const shown = shownContact(contact);
    const place = shown.places.at(0) ?? null;
    const address = place
        ? place.address
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .join(", ")
        : shown.address;
    const whatsapp = reachOf({
        phone: shown.phone,
        email: shown.email,
        social: shown.social,
    }).whatsapp;
    if (!address && !shown.phone && !whatsapp) return null;
    return {
        address: address ?? null,
        hours: place?.hours ?? null,
        timeZone: contact.timeZone ?? null,
        phone: shown.phone,
        whatsapp,
    };
}

export function LookHeader({
    look,
    name,
    items,
    homeHref,
    action,
    logo,
    bag,
    account,
    contact,
    session,
    basePath,
}: {
    look: LookId;
    name: string;
    /** The menu less the main action's page, each address prefixed. */
    items: SiteNavItem[];
    homeHref: string;
    action: SiteHeaderAction | null;
    logo: string | null;
    bag?: ReactNode;
    account?: ReactNode;
    contact?: SiteContact | null;
    session?: SiteSession | null;
    basePath: string;
}) {
    const style = HEADER[look];
    // "Visit us" opens the footer's facts, on every page that has some.
    const withVisit = withVisitUs(items, hasFooterFacts(contact));
    const facts = lookMenuFacts(contact);
    const menu = (
        <LookMenu
            look={look}
            name={name}
            homeHref={homeHref}
            items={withVisit}
            action={action}
            facts={facts}
            session={session ?? null}
            basePath={basePath}
            side={look === "quiet" ? "start" : "end"}
        />
    );
    const nameLink = (
        <Link
            href={homeHref}
            aria-label={`${name}, home`}
            title={name}
            className={`font-site-heading text-site-fg flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 [font-variant-numeric:lining-nums] ${style.name} ${LOOK_RING}`}
        >
            {logo ? (
                // The name beside it says whose it is. Remote media from any
                // tenant origin: a plain <img>, as every block's.
                <img
                    src={logo}
                    alt=""
                    width={32}
                    height={32}
                    {...siteImage("above", { src: logo, sizes: "120px" })}
                    data-site-logo=""
                    className="rounded-site-s h-8 w-auto max-w-[7.5rem] shrink-0 object-contain"
                />
            ) : null}
            <span className="truncate">{name}</span>
        </Link>
    );
    const actions = (
        <div
            className={`flex min-w-0 items-center justify-end ${style.actions}`}
        >
            {bag ? <span className={SLOT}>{bag}</span> : null}
            {account ? (
                <span
                    // Folio and Quiet keep Sign in in the phone menu, as
                    // their boards draw it; Live keeps it in the row.
                    className={`${SLOT} ${look === "live" ? "" : "max-[699px]:[&>*]:hidden"}`}
                >
                    {account}
                </span>
            ) : null}
            {action ? (
                <LookActionLink
                    action={action}
                    look={look}
                    basePath={basePath}
                />
            ) : null}
            {look === "quiet" ? null : menu}
        </div>
    );

    return (
        <header
            data-site-header=""
            data-site-look-header={look}
            className={`bg-site-bg font-site-body relative z-30 min-[700px]:sticky min-[700px]:top-0 ${style.header}`}
        >
            <div
                className={`max-w-site-content mx-auto grid items-center ${style.row}`}
            >
                {look === "quiet" ? (
                    <>
                        <div className="flex min-w-0 items-center">
                            {menu}
                            <LookNavRow items={withVisit} look={look} />
                        </div>
                        {nameLink}
                        {actions}
                    </>
                ) : (
                    <>
                        {nameLink}
                        <LookNavRow items={withVisit} look={look} />
                        {actions}
                    </>
                )}
            </div>
        </header>
    );
}
