"use client";

import type { RenderedVisitUs } from "@saroh/block-contract";
import { ctaHref } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import { openState, openStateText, weekSummary } from "../lib/opening-hours";
import { phoneText } from "../lib/phone";
import type { PublicVisit } from "../lib/public-visit";
import { usePublicVisit } from "../lib/use-public-visit";
import { cn } from "../lib/utils";

/**
 * `visitUs` v1 — one place's address, hours and phone, read live (G8).
 *
 * The section stores which storefront and two switches. Everything a visitor
 * reads comes from the public visit read when the page is viewed:
 *
 *   GET ${apiUrl}/public/sites/:siteId/visit/:storeId   — the chosen shop
 *   GET ${apiUrl}/public/sites/:siteId/visit            — no shop chosen
 *
 * The first serves a place only while it belongs to the site's business, is
 * a `SHOP` and is not closed. With no shop chosen the block reads the
 * business's own place (template polish), as Opening hours always has: its
 * first open shop, else the business profile's address and hours — so a
 * business with one place needs to choose nothing. So:
 * - the place is gone, closed or went online-only, or the business has no
 *   place at all: the block renders NOTHING rather than a card with no
 *   place in it;
 * - no hours saved: the hours line and "Open now" are left out, never
 *   "Closed" (a claim the business never made);
 * - no phone: no Call button;
 * - the request fails: the block's own error state, with a retry.
 *
 * `visit` skips the fetch — the catalog, the Add-block picker and the tests
 * pass a sample place, because a fixture's id belongs to no storefront.
 * `siteId` undefined means this is drawn where no site is live (the editor's
 * canvas); the block then says where the real values come from instead of
 * inventing them.
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

export { isPublicVisit } from "../lib/public-visit";
export type { PublicVisit } from "../lib/public-visit";

/** What the card says when the merchant left the title empty. */
export const VISIT_US_TITLE = "Come and see us";

/**
 * A maps search for the address — Get directions. Lines are split and
 * trimmed, as `contact` does, rather than a regex over whitespace.
 */
export function directionsHref(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        address
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(", "),
    )}`;
}

const noPage = () => undefined;

/** A value with something in it, else null: an empty string says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

export default function VisitUsSection({
    content,
    siteId,
    apiUrl = DEFAULT_API_URL,
    visit: given,
    now,
}: {
    content: RenderedVisitUs;
    /**
     * The live site's id — the read resolves the business from it. `null`:
     * a live render that could not tell (the block draws nothing).
     * Undefined: not a live site at all (the editor canvas).
     */
    siteId?: string | null;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /** A sample place to draw instead of fetching (catalog, tests). */
    visit?: PublicVisit;
    /** The moment "Open now" is worked out for. Tests pin it. */
    now?: Date;
}) {
    const storeId = said(content.storeId);
    // The same read the Opening hours block makes: the chosen shop, or with
    // none the business's own place (template polish).
    const { state, retry } = usePublicVisit({
        siteId,
        storeId,
        apiUrl,
        given,
    });

    const title = said(content.title) ?? VISIT_US_TITLE;

    if (state.kind === "idle") {
        return (
            <VisitCard title={title}>
                <p className="mt-1.5 text-sm leading-relaxed opacity-85">
                    {storeId
                        ? "The address, opening hours and phone of your shop show here on your live site."
                        : "Your business's address, opening hours and phone show here on your live site. Choose a shop to show that one instead."}
                </p>
            </VisitCard>
        );
    }
    if (state.kind === "ready" && state.visit === null) return null;

    if (state.kind === "loading") {
        return (
            <VisitCard title={title}>
                <p className="mt-1.5 text-sm opacity-85">
                    Loading our address and hours…
                </p>
            </VisitCard>
        );
    }
    if (state.kind === "error") {
        return (
            <VisitCard title={title}>
                <p role="alert" className="mt-1.5 text-sm opacity-85">
                    We couldn&apos;t load our address and hours right now —
                    please try again shortly.
                </p>
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={retry}
                        className={secondaryButton}
                    >
                        Try again
                    </button>
                </div>
            </VisitCard>
        );
    }

    const place = state.visit;
    if (!place) return null;
    const showHours = content.showHours !== false;
    const hours = showHours ? weekSummary(place.hours) : null;
    const status = showHours
        ? // A closure day reads closed here as it does in the hero (G-2).
          openState(
              place.hours,
              now ?? new Date(),
              place.timezone,
              place.closedDates,
          )
        : null;
    const address = said(place.address);
    const directions =
        content.showMap !== false && address ? directionsHref(address) : null;
    const phone = said(place.phone);
    // A business's own place may be only a name (template polish): with no
    // address, hours or phone the card would say nothing.
    if (!address && !hours && !phone) return null;

    return (
        <VisitCard
            title={title}
            actions={
                phone || directions ? (
                    <div className="flex flex-wrap gap-2">
                        {phone ? (
                            <a
                                href={ctaHref(
                                    { kind: "call", number: phone },
                                    noPage,
                                )}
                                className={primaryButton}
                            >
                                Call {phoneText(phone)}
                            </a>
                        ) : null}
                        {directions ? (
                            <a
                                href={directions}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={secondaryButton}
                            >
                                Get directions
                            </a>
                        ) : null}
                    </div>
                ) : null
            }
        >
            {address || hours ? (
                <p className="mt-1.5 text-sm leading-relaxed opacity-85">
                    {address ? (
                        <span className="block whitespace-pre-line">
                            {address}
                        </span>
                    ) : null}
                    {hours ? <span className="block">{hours}</span> : null}
                </p>
            ) : null}
            {status ? (
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                    <span
                        aria-hidden="true"
                        className={cn(
                            "inline-block size-2 rounded-full",
                            status.open ? "bg-site-accent" : "bg-site-bg/50",
                        )}
                    />
                    {openStateText(status)}
                </p>
            ) : null}
        </VisitCard>
    );
}

/*
 * The design's card: the page's ink as the ground and its paper as the type,
 * the merchant's accent on the one button that matters. A button's radius is
 * the site's; the card's is a step rounder, so a square-cornered theme stays
 * square.
 */
const buttonBase =
    "inline-flex min-h-11 items-center rounded-[var(--site-radius)] px-4 text-[0.9rem] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-fg";
const primaryButton = cn(buttonBase, "bg-site-accent text-site-accent-fg");
const secondaryButton = cn(
    buttonBase,
    "border border-site-bg/35 bg-transparent text-site-bg",
);

function VisitCard({
    title,
    actions,
    children,
}: {
    title: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div className="bg-site-fg text-site-bg grid items-center gap-4 rounded-[calc(var(--site-radius)*1.6)] p-[22px] [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
                <div className="min-w-0">
                    <h2
                        data-site-title=""
                        className="font-site-heading text-[calc(1.375rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                    >
                        {title}
                    </h2>
                    {children}
                </div>
                {actions ?? null}
            </div>
        </section>
    );
}
