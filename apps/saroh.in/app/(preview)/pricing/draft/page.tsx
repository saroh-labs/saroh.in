import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { PreviewBanner } from "@/components/pricing/preview/preview-banner";
import { PreviewControls } from "@/components/pricing/preview/preview-controls";
import { PricingPage } from "@/components/pricing/pricing-page";
import { Container } from "@/components/shared/layout/container";
import { SiteChrome } from "@/components/shared/layout/site-chrome";
import { LAUNCH_MODE } from "@/lib/links";
import { readLivePricing, readPreviewPricing } from "@/lib/pricing";
import { markChanges } from "@/lib/pricing-marks";
import {
    PREVIEW_COOKIE,
    previewHref,
    previewViewFrom,
} from "@/lib/pricing-preview";
import { pricingPageModel } from "@/lib/pricing-view";
import { ring } from "@/lib/ring";

/**
 * `/pricing/draft` — the shared draft of the pricing catalogue, for a staff
 * member who opened a preview link (`/pricing/preview?token=…`, KTD-10). The
 * token rides in an HttpOnly cookie and goes to the API with every request;
 * nothing is cached. Not indexed, no referrer, no Google Analytics
 * (`app/site-tags.tsx`); `next.config.js` sets the same as headers.
 *
 * Outside the `(site)` group so the amber bar sits above the nav, as the
 * design draws it; it brings the V2 chrome itself (`SiteChrome preview`).
 *
 * The bar holds the preview's controls (admin redesign U13, R24): the draft
 * or what is live now, desktop or phone width, and Show what changed, which
 * marks on the draft what differs from live. Phone draws this same page,
 * bar-less (`frame=1`), in a phone-sized frame, so the page's own phone
 * layout shows rather than a squeezed desktop one.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Draft pricing preview · Saroh",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

export default async function PricingDraftRoute({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const view = previewViewFrom(await searchParams);
    const token = (await cookies()).get(PREVIEW_COOKIE)?.value;
    const read = token
        ? await readPreviewPricing(token)
        : ({ ok: false, reason: "expired" } as const);

    if (!read.ok) {
        return (
            <SiteChrome
                preview
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
                            className={`rounded-sm text-brand-700 no-underline hover:text-foreground ${ring()}`}
                        >
                            See the published pricing
                        </Link>
                    ) : null}
                </Container>
            </SiteChrome>
        );
    }

    const live = await readLivePricing().catch(() => null);
    const draftModel = pricingPageModel(read.catalog);
    const liveModel = live ? pricingPageModel(live) : null;
    const showLive = view.show === "live" && liveModel !== null;
    const model = showLive
        ? liveModel
        : view.marks && liveModel
          ? markChanges(draftModel, liveModel)
          : draftModel;

    if (view.frame) {
        return (
            <SiteChrome preview>
                <PricingPage model={model} />
            </SiteChrome>
        );
    }

    const banner = (
        <PreviewBanner
            controls={
                <PreviewControls view={view} hasLive={liveModel !== null} />
            }
        >
            {showLive
                ? "Live now: what visitors see."
                : "Draft preview. Visitors still see the published pricing."}
        </PreviewBanner>
    );

    if (view.width === "phone") {
        return (
            <div className="min-h-screen bg-mk-line-soft text-foreground [line-height:normal]">
                {banner}
                <div className="flex justify-center px-4 pb-16 pt-7">
                    <iframe
                        src={previewHref({ ...view, frame: true })}
                        title={
                            showLive
                                ? "The pricing page at phone width, as it is live"
                                : "The draft pricing page at phone width"
                        }
                        className="h-[844px] w-[390px] max-w-full rounded-[28px] border border-border bg-background shadow-lg"
                    />
                </div>
            </div>
        );
    }

    return (
        <SiteChrome preview banner={banner}>
            <PricingPage model={model} />
        </SiteChrome>
    );
}
