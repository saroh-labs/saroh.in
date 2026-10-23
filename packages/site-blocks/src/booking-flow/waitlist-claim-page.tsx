import type { LookId } from "@saroh/block-contract";
import Link from "next/link";

import { ctaClasses } from "../blocks/cta";
import { frontButton } from "../blocks/look-front";
import { SitePageMessage } from "../site-page-message";
import type { WaitlistClaim } from "./waitlist-claim";
import { claimWords } from "./waitlist-claim";

/**
 * A waitlist offer's claim page (automatic notices U18, #1149), opened from
 * the offer's email: the class, its time and "Book my spot until 6:30 pm",
 * which opens the booking page on that session. Ended or gone, it says so,
 * with a way back into the class when there is one, and always the home
 * page.
 *
 * The site's own page frame (`SitePageMessage`), so it is drawn from
 * `--site-*` only, in Classic or the site's look. No `"use client"`.
 */
export function WaitlistClaimPage({
    claim,
    look,
}: {
    claim: WaitlistClaim;
    /** Folio, Quiet or Live (DEC-172); absent is Classic. */
    look?: LookId;
}) {
    const words = claimWords(claim);
    const primary = look ? frontButton(look, "fill") : ctaClasses("primary");
    const secondary = look
        ? frontButton(look, "link")
        : ctaClasses("secondary");
    return (
        <SitePageMessage
            look={look}
            eyebrow={words.eyebrow}
            title={words.title}
            actions={
                <>
                    {words.action ? (
                        <Link
                            href={words.action.href}
                            data-site-primary=""
                            className={primary}
                        >
                            {words.action.label}
                        </Link>
                    ) : null}
                    <Link
                        href="/"
                        className={words.action ? secondary : primary}
                    >
                        Go to the home page
                    </Link>
                </>
            }
        >
            {words.body}
        </SitePageMessage>
    );
}
