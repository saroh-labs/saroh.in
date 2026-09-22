"use client";

import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Some of this business's storefronts could not be read.
 *
 * A business-wide list is assembled from one read per storefront, and a
 * storefront that fails is left out so the rest of the list still arrives.
 * That is the right trade — and it is also exactly how a screen lies: what is
 * on it looks like the whole list. So it says which storefronts are missing
 * and offers the only useful action, which is to try again.
 *
 * `router.refresh()` re-runs the server component, so the retry re-reads every
 * storefront rather than the one that failed; at this size that is a single
 * round trip and it keeps the page a single source of truth.
 */
export function StorefrontPartial({
    missing,
    missingWhat,
}: {
    missing: { id: string; name: string }[];
    /**
     * What is therefore absent, in this list's own words — "products sold only
     * there", "people who have only bought there". Naming it is the point: a
     * merchant can tell from the sentence whether the gap matters to them.
     */
    missingWhat: string;
}) {
    const router = useRouter();
    const [retrying, startRetry] = useTransition();
    if (missing.length === 0) return null;

    const names = missing.map((s) => s.name);
    const which =
        names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

    return (
        <PartialNotice
            className="mb-4"
            action={
                <Button
                    variant="outline"
                    size="sm"
                    disabled={retrying}
                    onClick={() => startRetry(() => router.refresh())}
                >
                    {retrying ? "Trying…" : "Try again"}
                </Button>
            }
        >
            {`${which} could not be read, so ${missingWhat} are missing from this list. What is here is correct — what could not be read is left out rather than counted as nothing.`}
        </PartialNotice>
    );
}
