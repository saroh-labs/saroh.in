/**
 * The pay link that doesn't open (ADR-007, U13): a link replaced by a newer
 * one, revoked when the invoice was cancelled, or never real all read the
 * same, "This link no longer works", so the page gives nothing away about
 * which. Too many tries and our own failure say so instead. Drawn in the
 * merchant site's neutral `--site-*` defaults: with no invoice there is no
 * business theme to wear.
 */
export type PayLinkGoneReason = "missing" | "busy" | "unavailable";

const GONE: Record<PayLinkGoneReason, { title: string; body: string }> = {
    missing: {
        title: "This link no longer works",
        body: "The invoice may have been cancelled, or the business may have sent you a newer link. Ask them for the latest one.",
    },
    busy: {
        title: "Too many tries at once",
        body: "Wait a minute, then open the link again.",
    },
    unavailable: {
        title: "We couldn't open your invoice",
        body: "Something went wrong on our side. Try the link again in a moment.",
    },
};

export function PayLinkGone({ reason }: { reason: PayLinkGoneReason }) {
    const copy = GONE[reason];
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
