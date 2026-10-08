import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { TestReleaseGate } from "@/components/test-release-gate";
import { servedHost } from "@/lib/origin";
import { liveHostOf } from "@/lib/site-host-mode";
import { TEST_GATE_HEADER } from "@/lib/test-host";
import { rootDomain } from "@/lib/test-release";

/**
 * A test release's host with no link in hand (DEC-071, T5).
 *
 * The middleware serves this for every path of a test host that holds no
 * link cookie, and marks the request so; typed at this path by anyone else
 * (the apex, a live host's rewrite) it is simply not here.
 */

export const metadata: Metadata = {
    title: "Test release",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

export default async function TestReleaseGatePage() {
    const requestHeaders = await headers();
    if (!requestHeaders.get(TEST_GATE_HEADER)) notFound();
    // The live site beside this test host, so a visitor without the link
    // has somewhere to go (UX-081).
    const host = servedHost(requestHeaders);
    const live = host ? liveHostOf(host, rootDomain()) : null;
    return (
        <TestReleaseGate
            reason="missing"
            liveUrl={live ? `https://${live}/` : null}
        />
    );
}
