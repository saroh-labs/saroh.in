"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useSyncExternalStore } from "react";

import { buttonClasses } from "@/components/v2/button";
import type { Consent } from "@/lib/consent";
import {
    clearAnalyticsCookies,
    readConsent,
    subscribeConsent,
    writeConsent,
} from "@/lib/consent";
import { isTeamBrowser } from "@/lib/team-browser";

/** Before the browser has been asked (the server's render): show nothing. */
const UNREAD = "unread";

/** The team cookie is set by a page load, never while a page is open. */
const NO_CHANGES = () => () => undefined;
const teamBrowser = () => isTeamBrowser(document.cookie);

import { isPreviewPath } from "@/lib/pricing-preview";

/**
 * Google Analytics, given a measurement id — which the layout passes only
 * on a Vercel production deployment (`lib/ga.ts`). Without one nothing
 * loads and no notice shows, so previews, local dev and the browser tests
 * never reach GA. Never on a pricing draft preview (KTD-10): a staff member
 * checking a draft is not a visit, and the preview address must not reach a
 * third party.
 *
 * With one, GA loads only after the visitor accepts the cookie notice. Until
 * they answer, the notice sits in a corner (not a wall: the page works
 * behind it). Refusing keeps GA off and clears any GA cookies; the answer is
 * remembered (`lib/consent.ts`), and "Cookie choices" in the footer asks
 * again.
 *
 * Never in a Saroh team browser (`lib/team-browser.ts`): our own visits
 * aren't visitors.
 */
export function GoogleAnalytics({
    id,
    privacyHref,
}: {
    id: string | undefined;
    /** The Privacy page, once it is published; the notice links it. */
    privacyHref?: string;
}) {
    const pathname = usePathname();
    const choice = useSyncExternalStore<Consent | null | typeof UNREAD>(
        subscribeConsent,
        readConsent,
        () => UNREAD,
    );
    const team = useSyncExternalStore(NO_CHANGES, teamBrowser, () => false);
    if (!id || isPreviewPath(pathname) || choice === UNREAD || team)
        return null;
    if (choice === "granted") return <GaTag id={id} />;
    if (choice === "refused") return null;
    return <CookieNotice privacyHref={privacyHref} />;
}

function GaTag({ id }: { id: string }) {
    return (
        <>
            <Script
                async
                src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
            ></Script>
            <Script id="google-analytics">
                {` window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${id}');`}
            </Script>
        </>
    );
}

/**
 * The cookie notice: one line, a link to Privacy (once published), and two
 * buttons of equal weight. A region in the corner, never a modal: nothing
 * behind it is blocked, and focus is not taken.
 */
function CookieNotice({ privacyHref }: { privacyHref?: string }) {
    return (
        <section
            aria-label="Cookies"
            className="fixed inset-x-3 bottom-3 z-40 grid gap-4 rounded-mk-card border border-border bg-card p-5 font-sans text-foreground shadow-mk-menu min-[520px]:inset-x-auto min-[520px]:bottom-5 min-[520px]:left-5 min-[520px]:max-w-[420px]"
        >
            <p className="m-0 text-[14.5px] leading-[1.55] text-mk-copy">
                saroh.in uses Google Analytics cookies to count visits. Refuse
                them and the site works the same.
                {privacyHref ? (
                    <>
                        {" "}
                        <Link
                            href={privacyHref}
                            className="cursor-pointer rounded-sm text-foreground underline underline-offset-[3px] hover:text-mk-copy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:text-muted-foreground"
                        >
                            Privacy
                        </Link>
                    </>
                ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => writeConsent("granted")}
                    className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                        className: "bg-transparent",
                    })}
                >
                    Accept
                </button>
                <button
                    type="button"
                    onClick={() => {
                        writeConsent("refused");
                        clearAnalyticsCookies();
                    }}
                    className={buttonClasses({
                        variant: "secondary",
                        size: "sm",
                        className: "bg-transparent",
                    })}
                >
                    Refuse
                </button>
            </div>
        </section>
    );
}
