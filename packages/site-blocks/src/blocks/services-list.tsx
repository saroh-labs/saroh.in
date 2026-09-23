"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { RenderedServicesList } from "@saroh/block-contract";

import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
import { cn } from "../lib/utils";
import { CtaButton, ctaClasses } from "./cta";

/**
 * `servicesList` v1 — the merchant's real Services, read live (#255).
 *
 * The section stores only which services, in what order. Names, durations and
 * prices come from the public endpoint when the page is viewed:
 *
 *   GET ${NEXT_PUBLIC_API_URL}/public/services?ids=a,b,c
 *
 * which returns only services that may still be offered (active, not deleted,
 * Appointments not switched off), in the order asked for. So:
 * - a service deleted or archived after publish is simply absent;
 * - none left: the block renders NOTHING — a heading over an empty list, or a
 *   "Book now" for services that no longer exist, would promise what the
 *   business cannot keep;
 * - the request fails: the block's own error state, with a retry, like booking.
 *
 * `services` skips the fetch. The catalog and the snapshot tests pass sample
 * services through it, because fixture ids belong to no real Service.
 *
 * Drawn from `--site-*` only; gate G2 fails the build otherwise.
 */

/** A service as the public endpoint returns it. */
export interface PublicService {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number | null;
    currency: string | null;
}

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; services: PublicService[] }
    | { kind: "error" };

function isPublicService(value: unknown): value is PublicService {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        (v.description === null || typeof v.description === "string") &&
        typeof v.durationMinutes === "number" &&
        (v.priceCents === null || typeof v.priceCents === "number") &&
        (v.currency === null || typeof v.currency === "string")
    );
}

/** "30 min", "1 hr", "1 hr 30 min". */
export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * A service price, or null when there is none to show; an absent price is
 * never "0".
 *
 * `priceCents` is the amount x 100 for EVERY currency: that is how the service
 * form writes it (`Math.round(price * 100)`) and how the workspace reads it
 * (`formatMoney`, amount / 100). Dividing by the currency's own minor unit
 * instead showed a ¥1,500 service as ¥150,000 (review of #255). Intl still
 * chooses the decimals to DISPLAY, so yen shows none.
 *
 * `locale` defaults to the visitor's; tests pin one.
 */
export function formatPrice(
    priceCents: number | null,
    currency: string | null,
    locale?: string,
): string | null {
    if (priceCents === null || !currency) return null;
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
        }).format(priceCents / 100);
    } catch {
        // An unknown currency code: better no price than a wrong one.
        return null;
    }
}

export default function ServicesListSection({
    content,
    apiUrl = DEFAULT_API_URL,
    services: given,
    bookHref,
}: {
    content: RenderedServicesList;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /** Sample services to draw instead of fetching (catalog, tests). */
    services?: PublicService[];
    /**
     * The site's booking page (U19), on a live site only: each service links
     * to it, opened on that service. A preview has no `/book`.
     */
    bookHref?: string;
}) {
    const [state, setState] = useState<LoadState>(
        given ? { kind: "ready", services: given } : { kind: "loading" },
    );
    const ids = content.serviceIds.join(",");
    // The ids on screen now, so a retry that lands late cannot overwrite them.
    const idsRef = useRef(ids);
    useEffect(() => {
        idsRef.current = ids;
    }, [ids]);

    const load = useCallback(async (): Promise<LoadState> => {
        if (!ids) return { kind: "ready", services: [] };
        try {
            const res = await fetch(
                `${apiUrl}/public/services?ids=${encodeURIComponent(ids)}`,
                { headers: { accept: "application/json" } },
            );
            if (!res.ok) return { kind: "error" };
            const body: unknown = await res.json().catch(() => null);
            // Narrowed, not cast (#264): a wrong shape is an error state, not
            // a crash that takes the page down.
            if (!Array.isArray(body) || !body.every(isPublicService)) {
                return { kind: "error" };
            }
            return { kind: "ready", services: body };
        } catch {
            return { kind: "error" };
        }
    }, [apiUrl, ids]);

    useEffect(() => {
        if (given) return;
        let active = true;
        void load().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [given, load]);

    const retry = () => {
        const asked = ids;
        setState({ kind: "loading" });
        void load().then((next) => {
            if (idsRef.current === asked) setState(next);
        });
    };

    if (state.kind === "ready" && state.services.length === 0) return null;

    const showPrices = content.showPrices !== false;

    return (
        <section className="mx-auto w-full max-w-3xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.heading ? (
                <h2 className="text-site-fg text-[calc(1.875rem*var(--site-heading-scale))] font-bold tracking-tight">
                    {content.heading}
                </h2>
            ) : null}
            {content.intro ? (
                <p className="text-site-body mt-3 text-lg">{content.intro}</p>
            ) : null}

            {state.kind === "loading" ? (
                <p className="text-site-muted mt-8 text-sm">
                    Loading services…
                </p>
            ) : state.kind === "error" ? (
                <div className="mt-8">
                    <p role="alert" className={destructiveAlertClasses}>
                        We couldn&apos;t load our services right now — please
                        try again shortly.
                    </p>
                    <button
                        type="button"
                        onClick={retry}
                        className={cn(ctaClasses("secondary"), "mt-3")}
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    <ul className="border-site-border mt-8 border-t">
                        {state.services.map((service) => {
                            const price = showPrices
                                ? formatPrice(
                                      service.priceCents,
                                      service.currency,
                                  )
                                : null;
                            return (
                                <li
                                    key={service.id}
                                    className="border-site-border flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b py-5"
                                >
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-site-fg text-[calc(1.125rem*var(--site-heading-scale))] font-semibold">
                                            {service.name}
                                        </h3>
                                        {service.description ? (
                                            <p className="text-site-body mt-1 whitespace-pre-line leading-relaxed">
                                                {service.description}
                                            </p>
                                        ) : null}
                                    </div>
                                    <p className="text-site-fg shrink-0 text-sm tabular-nums">
                                        <span className="text-site-muted">
                                            {formatDuration(
                                                service.durationMinutes,
                                            )}
                                        </span>
                                        {price ? (
                                            <span className="ml-3 font-semibold">
                                                {price}
                                            </span>
                                        ) : null}
                                        {bookHref ? (
                                            <a
                                                href={`${bookHref}?service=${encodeURIComponent(service.id)}`}
                                                aria-label={`Book ${service.name}`}
                                                className="text-site-fg ml-3 font-semibold underline underline-offset-4"
                                            >
                                                Book
                                            </a>
                                        ) : null}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                    {content.cta ? (
                        <div className="mt-8">
                            <CtaButton content={content.cta} />
                        </div>
                    ) : null}
                </>
            )}
        </section>
    );
}
