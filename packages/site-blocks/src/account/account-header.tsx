"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import { trimTrailingSlashes } from "../url-path";
import type { AccountTab } from "./model";
import { firstName } from "./model";
import { currentTab } from "./tab-bar";

/**
 * The account area's compact header (DEC-073 #10; Saroh Customer Site
 * design): the business's letter and name, which go back to the site, and
 * the current tab's title — "Hi, Asha" on Home. The site's own header and footer
 * are not drawn around the account (`SiteChromeFrame`), as the design's
 * signed-in app has neither.
 *
 * The design also carries a language switch (हिंदी). The site has no second
 * language yet, so there is no switch to draw; it comes with one.
 *
 * The title is the page's one heading (h1): the tabs no longer draw their
 * own. Drawn from `--site-*` only.
 */

/** The header's title for a path: the tab's name, "Hi, ‹first›" on Home. */
export function accountTitle(
    pathname: string | null,
    tabs: AccountTab[],
    name: string | null,
): string {
    const path = trimTrailingSlashes(pathname ?? "");
    if (path.startsWith("/account/receipts/")) return "Receipt";
    const tab = currentTab(path === "" ? null : path, tabs);
    if (tab === "home") {
        const first = firstName(name);
        return first ? `Hi, ${first}` : "Hi";
    }
    const label = tabs.find((t) => t.key === tab)?.label;
    return label ?? "Your account";
}

/** The business's letter: the first letter or digit of its name. */
export function businessInitial(name: string): string {
    const match = /[A-Za-z0-9\u00C0-\uFFFF]/.exec(name);
    return (match?.[0] ?? "·").toLocaleUpperCase();
}

export function AccountHeader({
    businessName,
    tabs = [],
    name = null,
    title,
    homeHref = "/",
}: {
    businessName: string;
    /** This business's tabs; none while signed out. */
    tabs?: AccountTab[];
    /** The customer's name, for Home's "Hi, ‹first›". */
    name?: string | null;
    /** A title of the caller's, in place of the tab's (signed out). */
    title?: ReactNode;
    homeHref?: string;
}) {
    const pathname = usePathname();
    const heading = title ?? accountTitle(pathname, tabs, name);
    return (
        <header className="bg-site-bg border-site-border font-site-body sticky top-0 z-30 border-b">
            <div className="mx-auto flex max-w-[640px] items-center gap-2.5 px-[18px] py-3">
                <Link
                    href={homeHref}
                    aria-label={`Back to the site: ${businessName}`}
                    title="Back to the site"
                    className={cn(
                        "bg-site-accent text-site-accent-fg font-site-heading grid h-[34px] w-[34px] shrink-0 cursor-pointer place-items-center rounded-[calc(var(--site-radius)+8px)] text-base font-bold transition-[opacity,transform] duration-100 hover:opacity-90 active:scale-[0.96]",
                        focusRing,
                    )}
                >
                    <span aria-hidden="true">
                        {businessInitial(businessName)}
                    </span>
                </Link>
                <div className="min-w-0 flex-1">
                    {/* Whose account this is, and the way back (UX-075):
                        the letter alone read "U · Hi". */}
                    <Link
                        href={homeHref}
                        className={cn(
                            "text-site-muted hover:text-site-fg block truncate text-xs font-medium",
                            focusRing,
                        )}
                    >
                        {businessName}
                    </Link>
                    <h1 className="font-site-heading text-site-fg m-0 truncate text-xl font-semibold tracking-[-0.02em]">
                        {heading}
                    </h1>
                </div>
            </div>
        </header>
    );
}

/**
 * The site's header and footer around a page, left out on the account area
 * (DEC-073 #10), which draws its own compact header. Decided by the address
 * in the browser, so moving between the site and the account in-app (the
 * header's account entry, the letter back to the site) swaps them at once.
 * `account` is off while the area is switched off: `/account` is then the
 * site's 404, in the site's chrome.
 */
export function SiteChromeFrame({
    header,
    footer,
    account,
    children,
}: {
    header: ReactNode;
    footer: ReactNode;
    account: boolean;
    children: ReactNode;
}) {
    const pathname = usePathname();
    const inAccount = account && isAccountPath(pathname);
    return (
        <>
            {inAccount ? null : header}
            <div>{children}</div>
            {inAccount ? null : footer}
        </>
    );
}

/** `/account` and every page under it. */
export function isAccountPath(pathname: string): boolean {
    return pathname === "/account" || pathname.startsWith("/account/");
}
