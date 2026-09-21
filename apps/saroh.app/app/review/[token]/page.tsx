import type { Metadata } from "next";

import { SiteTheme } from "@saroh/site-blocks";

import { ReviewForm } from "@/components/review-form";
import { getReviewInvitation } from "@/lib/reviews";

/**
 * A customer reviewing what they bought (product reviews, plan
 * 2026-09-21-001). On this service's own apex — no Site is tied to an order,
 * so there is no tenant host to choose — wearing the business's site theme.
 *
 * The link is a credential: the page is noindex and sends no referrer, so the
 * token never leaves in a Referer header to anything the page links to.
 */
export const metadata: Metadata = {
    title: "Review your order",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

const GONE: Record<
    "completed" | "not-eligible" | "expired" | "missing" | "unavailable",
    { title: string; body: string }
> = {
    completed: {
        title: "Thank you",
        body: "Every item on this order has been reviewed.",
    },
    "not-eligible": {
        title: "This order no longer takes reviews",
        body: "It may have been cancelled or refunded. Nothing you posted before has been removed.",
    },
    expired: {
        title: "This link has ended",
        body: "It may have expired, or the shop may have sent you a newer one — look for a more recent email from them.",
    },
    missing: {
        title: "This link has ended",
        body: "It may have expired, or the shop may have sent you a newer one — look for a more recent email from them.",
    },
    unavailable: {
        title: "We couldn't open your review",
        body: "Something went wrong on our side. Try the link again in a moment.",
    },
};

export default async function ReviewPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const result = await getReviewInvitation(token);

    if (!result.ok) {
        const copy = GONE[result.reason];
        return (
            <main className="min-h-screen bg-site-bg text-site-body">
                <section className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
                    <h1 className="text-2xl font-bold tracking-tight text-site-fg">
                        {copy.title}
                    </h1>
                    <p className="mt-2 text-site-muted">{copy.body}</p>
                </section>
            </main>
        );
    }

    const { invitation } = result;
    return (
        <main className="min-h-screen bg-site-bg text-site-body">
            {invitation.theme ? (
                <SiteTheme variables={invitation.theme} />
            ) : null}
            <ReviewForm token={token} invitation={invitation} />
        </main>
    );
}
