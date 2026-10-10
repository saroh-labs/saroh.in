import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { Container } from "@/components/v2/container";
import { PreviewBanner } from "@/components/v2/pricing/preview-banner";
import { PricingPage } from "@/components/v2/pricing/pricing-page";
import { SiteFooter } from "@/components/v2/site-footer";
import { SiteNav } from "@/components/v2/site-nav";
import { LAUNCH_MODE } from "@/lib/links";
import { readPreviewPricing } from "@/lib/pricing";
import { PREVIEW_COOKIE } from "@/lib/pricing-preview";
import { pricingPageModel } from "@/lib/pricing-view";

/**
 * `/pricing/draft` — the shared draft of the pricing catalogue, for a staff
 * member who opened a preview link (`/pricing/preview?token=…`, KTD-10). The
 * token rides in an HttpOnly cookie and goes to the API with every request;
 * nothing is cached. Not indexed, no referrer, no Google Analytics
 * (`app/site-tags.tsx`); `next.config.js` sets the same as headers.
 *
 * Outside the `(v2)` group so the amber bar sits above the nav, as the
 * design draws it; it brings the V2 chrome itself.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Draft pricing preview · Saroh",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

export default async function PricingDraftRoute() {
    const token = (await cookies()).get(PREVIEW_COOKIE)?.value;
    const read = token
        ? await readPreviewPricing(token)
        : ({ ok: false, reason: "expired" } as const);

    if (!read.ok) {
        return (
            <Chrome
                banner={
                    <PreviewBanner>
                        {read.reason === "expired"
                            ? "This preview has ended."
                            : "The draft couldn't be loaded."}
                    </PreviewBanner>
                }
            >
                <Container
                    as="section"
                    className="grid justify-items-start gap-4 pt-[72px]"
                >
                    <h1 className="m-0 font-display text-mk-h2-sm font-bold">
                        {read.reason === "expired"
                            ? "This preview link has ended."
                            : "The draft couldn't be loaded."}
                    </h1>
                    <p className="m-0 max-w-[58ch] text-mk-intro text-mk-copy">
                        {read.reason === "expired"
                            ? "Preview links last a few minutes and show one saved draft. Open a new preview from Plans & modules in the console."
                            : "Saroh's pricing service didn't answer. Try again in a moment, or open a new preview from Plans & modules in the console."}
                    </p>
                    {/* Published pricing exists once the launch switch opens;
                        before that /pricing waits at the waitlist (Gate W). */}
                    {LAUNCH_MODE === "open" ? (
                        <Link
                            href="/pricing"
                            className="rounded-sm text-brand-700 no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                        >
                            See the published pricing
                        </Link>
                    ) : null}
                </Container>
            </Chrome>
        );
    }

    return (
        <Chrome banner={<PreviewBanner />}>
            <PricingPage model={pricingPageModel(read.catalog)} />
        </Chrome>
    );
}

/** The `(v2)` layout's chrome, with the preview bar above the nav. */
function Chrome({
    banner,
    children,
}: {
    banner: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-foreground [line-height:normal]">
            <div className="mx-auto max-w-mk-page overflow-x-clip bg-background">
                {banner}
                <SiteNav />
                <main id="main">{children}</main>
                <SiteFooter />
            </div>
        </div>
    );
}
