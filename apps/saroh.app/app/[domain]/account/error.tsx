"use client";

import { AccountCard, ctaClasses } from "@saroh/site-blocks";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * A page of the customer's account that failed, inside the account's frame
 * (21 Nov): its header and tabs stay, so the customer can try again or open
 * another tab, instead of the whole site's error page taking the screen.
 * In the site's own palette, never Saroh's.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, {
            boundary: "sites/account",
            digest: error.digest,
        });
    }, [error]);

    return (
        <AccountCard
            labelledBy="account-page-failed"
            title="Couldn't load this page"
            lead={
                <span role="alert">
                    Nothing has changed. You're still signed in.
                </span>
            }
            actions={
                <button
                    type="button"
                    onClick={retry}
                    className={ctaClasses("primary")}
                >
                    Try again
                </button>
            }
        />
    );
}
