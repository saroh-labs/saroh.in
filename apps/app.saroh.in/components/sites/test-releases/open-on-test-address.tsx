"use client";

import { Button } from "@saroh/ui/button";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { openReleaseInNewTab } from "@/components/sites/test-releases/open-release";

/**
 * "Open on the test address" (DEC-071, T12): the release as a visitor would
 * meet it, on `test--<address>`, shop, booking and account pages included.
 * Mints this person a 12-hour link (T2) rather than asking anyone for one.
 */
export function OpenOnTestAddress({
    siteId,
    releaseId,
}: {
    siteId: string;
    releaseId: string;
}) {
    const [opening, setOpening] = useState(false);
    return (
        <Button
            type="button"
            variant="outline"
            disabled={opening}
            onClick={async () => {
                setOpening(true);
                await openReleaseInNewTab(siteId, releaseId);
                setOpening(false);
            }}
        >
            <ExternalLink aria-hidden className="size-4" />
            {opening ? "Opening…" : "Open on the test address"}
        </Button>
    );
}
