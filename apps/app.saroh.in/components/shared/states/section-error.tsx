"use client";

import { Button } from "@saroh/ui/button";
import { FailedState, SignedOutState } from "@saroh/ui/data-state";
import { reportError } from "@saroh/ui/lib/report-error";
import { backTo, couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { PageContainer } from "@/components/shared/page/page-container";
import { accountsLoginUrl } from "@/lib/accounts";
import { isDenial, statusFromError } from "@/lib/api/errors";
import { AccessDenied } from "./access-denied";

/** The address never changes under a boundary, so there is nothing to hear. */
const subscribeNever = () => () => undefined;

/**
 * The shared body of every segment-level `error.tsx`.
 *
 * Why segment boundaries exist at all: `app/error.tsx` sits at the ROOT, so it
 * replaces the whole document, sidebar, header and all. A failed query on one
 * orders page therefore took away the merchant's ability to navigate anywhere
 * else, turning a transient API hiccup into "the app is down". A boundary
 * inside `(shell)` renders in the content area with the chrome intact, so the
 * blast radius is the panel that actually failed.
 *
 * ## One page, said one way (UX audit, 10 Oct 2026)
 *
 * The 44 boundaries had three title grammars and thirteen bodies in a
 * developer's words, and 35 of their Try again buttons redrew the page
 * without reading again. So a boundary passes what it knows, never a
 * sentence:
 *
 * - `heading`: the page's own title, kept above the card, so the person
 *   still knows where they are;
 * - `things`: what couldn't be read, for "Couldn't load {things}";
 * - `reassurance`: the one true thing the screen can add to "Nothing has
 *   been changed." ("Your published site is unaffected.");
 * - `place` and `backHref`: the menu's name for the way back.
 *
 * `retry` is Next's own (16.3): it reads the segment from the server again.
 * `reset` only redraws the failed read, so no boundary passes it here.
 *
 * ## A denial is not a failure (#177, §30)
 *
 * A 403 renders {@link AccessDenied}, with no retry because there is nothing
 * to retry, and a 401 the signed-out card with its one action. Everything
 * else renders `FailedState`. They are distinguishable by shape, icon,
 * wording and ARIA, not by colour.
 *
 * ## Where a denial usually does NOT arrive from (#274)
 *
 * In a production build, a server component's thrown error reaches this
 * boundary with its message replaced by a digest, so `isDenial` cannot see a
 * 403 there. Server reads therefore don't throw a 403 at all: `getJson` calls
 * `forbidden()`, and the segment's `forbidden.tsx` renders the denial. This
 * branch still catches a denial whose message survived: in development, or
 * thrown on the client.
 */
export function SectionError({
    error,
    retry,
    heading,
    things,
    reassurance,
    backHref = "/",
    place = "Home",
    boundary = "app/section",
}: {
    error: Error & { digest?: string };
    /** Next's `retry`: reads the segment again. Never `reset`. */
    retry: () => void;
    /** The page's title, as its header says it. */
    heading?: string;
    /** What couldn't be read: "invoices", "this order". */
    things?: string;
    /** One true sentence beyond "Nothing has been changed." */
    reassurance?: string;
    backHref?: string;
    /** The menu's name for where `backHref` goes. */
    place?: string;
    boundary?: string;
}) {
    const denied = isDenial(error);
    const status = statusFromError(error);

    useEffect(() => {
        // Nothing went wrong on a denial, so there is nothing to report.
        if (!denied) reportError(error, { boundary, digest: error.digest });
    }, [boundary, denied, error]);

    // Signing in comes back to this page: "pick up where you left off".
    const here = useSyncExternalStore(
        subscribeNever,
        () => window.location.href,
        () => null,
    );

    if (denied && status === 401) {
        // A session that ran out is not a denial an owner or admin can
        // lift, so it says nothing about roles.
        return (
            <PageContainer>
                <SignedOutState
                    signInHref={
                        here
                            ? `${accountsLoginUrl}?redirect=${encodeURIComponent(here)}`
                            : accountsLoginUrl
                    }
                />
            </PageContainer>
        );
    }
    if (denied) {
        return <AccessDenied backHref={backHref} backLabel={backTo(place)} />;
    }

    return (
        <PageContainer>
            {heading ? (
                <PageHeader
                    holdsData={false}
                    title={heading}
                    className="mb-6"
                />
            ) : null}
            <FailedState
                data-ph-unmask=""
                title={couldntLoad(things)}
                description={nothingChanged(reassurance)}
                onRetry={retry}
                // The digest is the only handle support has on a specific
                // failure. Shown only when Next produced one.
                reference={error.digest}
                action={
                    <Button asChild variant="ghost" className="wk-press">
                        <Link href={backHref}>{backTo(place)}</Link>
                    </Button>
                }
            />
        </PageContainer>
    );
}
