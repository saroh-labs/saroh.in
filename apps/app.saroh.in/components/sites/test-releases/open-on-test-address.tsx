"use client";

import { Button } from "@saroh/ui/button";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { openReleaseInNewTab } from "@/components/sites/test-releases/open-release";
import { runAction } from "@/lib/api/run-action";

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
            onClick={async () => {
                await runAction(() => openReleaseInNewTab(siteId, releaseId), {
                    setBusy: setOpening,
                });
            }}
            busy={opening}
            busyLabel="Opening…"
        >
            <ExternalLink aria-hidden className="size-4" />
            Open on the test address
        </Button>
    );
}
