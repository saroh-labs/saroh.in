import type { Metadata } from "next";

import { WelcomeForward } from "@/components/v2/welcome-forward";
import { ACCOUNTS_URL } from "@/lib/links";
import { siteTagConfig } from "@/lib/site-tag-config";

export const metadata: Metadata = {
    title: "One moment — Saroh",
    robots: { index: false, follow: false },
};

/**
 * The sign-up hand-off (DEC-127, `lib/welcome.ts`). accounts.saroh.in sends
 * a newly verified account here on its way to onboarding. This page counts
 * the sign-up as an ad conversion, only for a visitor who accepted
 * advertising cookies on saroh.in, and sends the browser straight on. It is
 * here, not on accounts, because the answer to the cookie notice lives in
 * saroh.in's own storage and the advertising tags load nowhere else.
 *
 * Static, like every page: the address is read in the browser. Nobody is
 * meant to read it, so it says one line and offers the way on.
 */
export default function WelcomePage() {
    return (
        <main
            id="main"
            className="grid min-h-screen place-content-center gap-3 bg-background px-mk-gutter text-center font-sans text-foreground"
        >
            <p className="m-0 text-[18px] leading-[1.55]">
                One moment. Taking you to Saroh.
            </p>
            <p className="m-0 text-[14.5px] text-mk-copy">
                <WelcomeForward
                    config={siteTagConfig()}
                    accountsUrl={ACCOUNTS_URL}
                />
            </p>
        </main>
    );
}
