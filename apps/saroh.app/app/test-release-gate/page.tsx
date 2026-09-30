import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { TestReleaseGate } from "@/components/test-release-gate";
import { TEST_GATE_HEADER } from "@/lib/test-host";

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
    if (!(await headers()).get(TEST_GATE_HEADER)) notFound();
    return <TestReleaseGate reason="missing" />;
}
