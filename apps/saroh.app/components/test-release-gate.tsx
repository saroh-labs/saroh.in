import type { TestReleaseGone } from "@/lib/test-release";

/**
 * A test host that shows no release explains why (DEC-071, T5): no link, a
 * link that stopped working, a release thrown away, or one that is live now
 * (Q6, with the live site's address). Never the live site in its place (R12),
 * but a way to it: with no link in hand, "Go to the live site" (UX-081).
 *
 * Shared by the gate route (a test host with no link at all) and the tenant
 * layout (a link the API no longer opens). Deliberately NOT drawn in the
 * merchant's palette, as the draft preview's dead-link page is not: this is
 * Saroh speaking about a link, not part of the site.
 */

const COPY: Record<TestReleaseGone, { title: string; body: string }> = {
    missing: {
        title: "Open this test release from its link.",
        body: "A test release opens only from the link someone shared with you. Ask them to send it again.",
    },
    expired: {
        title: "This test release link has stopped working.",
        body: "Test release links last a set number of days. Ask whoever shared it for a new one.",
    },
    revoked: {
        title: "This test release link was taken back.",
        body: "Whoever shared it turned it off. Ask them for a new one if you still need to look.",
    },
    discarded: {
        title: "This test release was discarded.",
        body: "Whoever made it has thrown it away. Ask them which version to look at now.",
    },
    live: {
        title: "This test release is live now.",
        body: "What you were testing is the live site now.",
    },
    unavailable: {
        title: "This test release couldn’t be loaded.",
        body: "Something went wrong on our side. Try again in a minute.",
    },
};

const LINK =
    "inline-block cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-50 hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:bg-neutral-800";

export function TestReleaseGate({
    reason,
    liveUrl = null,
}: {
    reason: TestReleaseGone;
    liveUrl?: string | null;
}) {
    const copy = COPY[reason];
    return (
        <main
            data-test-release-gate={reason}
            className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-neutral-900"
        >
            <div className="max-w-md space-y-3 text-center">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Test release
                </p>
                <h1 className="text-xl font-semibold">{copy.title}</h1>
                <p className="text-sm text-neutral-600">{copy.body}</p>
                {(reason === "live" || reason === "missing") && liveUrl ? (
                    <p className="pt-2">
                        <a href={liveUrl} className={LINK}>
                            Go to the live site
                        </a>
                    </p>
                ) : null}
                {reason === "unavailable" ? (
                    <p className="pt-2">
                        {/* The same address again: the link's cookie is
                            still there, so this is a retry. */}
                        <a href="" className={LINK}>
                            Try again
                        </a>
                    </p>
                ) : null}
            </div>
        </main>
    );
}
