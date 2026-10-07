"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { RenderedServicesList } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";

import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
import { siteMoney } from "../lib/money";
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
    // Whole amounts without decimals (DEC-073 #11); an unknown currency
    // code is no price rather than a wrong one.
    return siteMoney(priceCents / 100, currency, locale);
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
    // One appointment, one price (template polish).
    if (resolveVariant("servicesList", content) === "priceCard") {
        return (
            <PriceCardSection
                content={content}
                state={state}
                retry={retry}
                bookHref={bookHref}
            />
        );
    }

    const showPrices = content.showPrices !== false;
    const showDescriptions = content.showDescriptions !== false;
    const label = said(content.buttonLabel);

    return (
        <section
            className={
                // Cards sit on the page's width, level with the Plans and
                // Product grid beside them (the design's Book and Prices
                // pages); a list keeps its reading column.
                content.layout === "cards"
                    ? "mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
                    : "mx-auto w-full max-w-3xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
            }
        >
            {content.heading ? (
                <h2
                    data-site-title=""
                    className="font-site-heading text-site-fg text-[calc(1.875rem*var(--site-heading-scale))] font-bold tracking-tight"
                >
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
            ) : content.layout === "cards" ? (
                <>
                    <ServiceCards
                        services={state.services}
                        showPrices={showPrices}
                        showDescriptions={showDescriptions}
                        label={label}
                        bookHref={bookHref}
                    />
                    {content.cta ? (
                        <div className="mt-8">
                            <CtaButton content={content.cta} />
                        </div>
                    ) : null}
                </>
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
                                        <h3 className="font-site-heading text-site-fg text-[calc(1.125rem*var(--site-heading-scale))] font-semibold">
                                            {service.name}
                                        </h3>
                                        {showDescriptions &&
                                        service.description ? (
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
                                                href={serviceHref(
                                                    bookHref,
                                                    service.id,
                                                )}
                                                aria-label={
                                                    label
                                                        ? `${label}: ${service.name}`
                                                        : `Book ${service.name}`
                                                }
                                                className="text-site-fg ml-3 font-semibold underline underline-offset-4"
                                            >
                                                {label ?? "Book"}
                                            </a>
                                        ) : label ? (
                                            // The editor's canvas has no
                                            // booking page: the merchant's
                                            // words show, and go nowhere.
                                            <span className="text-site-fg ml-3 font-semibold underline underline-offset-4">
                                                {label}
                                            </span>
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

/** A value with something in it, else null: an empty string says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/** The booking page, opened on one service. */
function serviceHref(bookHref: string, serviceId: string): string {
    return `${bookHref}?service=${encodeURIComponent(serviceId)}`;
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/* The design's card button: the merchant's accent, the site's radius. */
const cardButton =
    "inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-[var(--site-radius)] bg-site-accent px-3.5 text-[13.5px] font-bold text-site-accent-fg";

/**
 * "Show as: Cards" (G16): the services side by side, as the Customer Site
 * design draws a Book page — how long, the name, a line about it, the price
 * and a button that opens the booking page on that service.
 */
function ServiceCards({
    services,
    showPrices,
    showDescriptions,
    label,
    bookHref,
}: {
    services: PublicService[];
    showPrices: boolean;
    showDescriptions: boolean;
    /** The merchant's button words; null keeps "Book". */
    label: string | null;
    bookHref?: string;
}) {
    const words = label ?? "Book";
    return (
        <ul className="mt-8 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
            {services.map((service) => {
                const price = showPrices
                    ? formatPrice(service.priceCents, service.currency)
                    : null;
                return (
                    <li
                        key={service.id}
                        className="border-site-border bg-site-surface text-site-fg grid min-w-0 content-start gap-1.5 overflow-hidden rounded-[calc(var(--site-radius)*1.4)] border p-4"
                    >
                        <span className="text-site-muted text-[11.5px] font-bold uppercase tracking-[0.08em]">
                            {formatDuration(service.durationMinutes)}
                        </span>
                        <h3 className="font-site-heading text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em]">
                            {service.name}
                        </h3>
                        {showDescriptions && service.description ? (
                            <p className="text-site-body whitespace-pre-line text-[13.5px] leading-normal [text-wrap:pretty]">
                                {service.description}
                            </p>
                        ) : null}
                        <span className="mt-1.5 flex items-center gap-2.5">
                            <span className="flex-1 text-base font-bold tabular-nums">
                                {price}
                            </span>
                            {bookHref ? (
                                <a
                                    href={serviceHref(bookHref, service.id)}
                                    aria-label={`${words}: ${service.name}`}
                                    className={cn(
                                        cardButton,
                                        "cursor-pointer transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]",
                                        focusRing,
                                    )}
                                >
                                    {words}
                                </a>
                            ) : (
                                <span className={cardButton}>{words}</span>
                            )}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * The `priceCard` look (template polish), as the dietician design sets out
 * its one consultation: on the left the heading, the intro and what the
 * appointment includes (rows under a label, hairlines between); on the
 * right a card for the first service still offered — its name, its price
 * set large in the heading face with "for 45 minutes", the merchant's mode
 * line, a full-width button and their follow-up line. The price and the
 * duration are always the service's own, read live; the lines around them
 * are the merchant's words. With no price set the card says how long it
 * takes and nothing about cost. On a phone the card follows the words.
 */
function PriceCardSection({
    content,
    state,
    retry,
    bookHref,
}: {
    content: RenderedServicesList;
    state: LoadState;
    retry: () => void;
    bookHref?: string;
}) {
    const heading = said(content.heading);
    const intro = said(content.intro);
    const includes = (content.includes ?? [])
        .map((line) => line.trim())
        .filter(Boolean);
    const includesLabel = said(content.includesLabel);
    const words = heading !== null || intro !== null || includes.length > 0;
    const service = state.kind === "ready" ? state.services[0] : undefined;

    const card =
        state.kind === "loading" ? (
            <p className="text-site-muted text-sm">Loading…</p>
        ) : state.kind === "error" ? (
            <div>
                <p role="alert" className={destructiveAlertClasses}>
                    We couldn&apos;t load this right now — please try again
                    shortly.
                </p>
                <button
                    type="button"
                    onClick={retry}
                    className={cn(ctaClasses("secondary"), "mt-3")}
                >
                    Try again
                </button>
            </div>
        ) : service ? (
            <PriceCard
                content={content}
                service={service}
                bookHref={bookHref}
            />
        ) : null;

    return (
        <section className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <div
                className={
                    words
                        ? "grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_316px] md:gap-14"
                        : "max-w-[316px]"
                }
            >
                {words ? (
                    <div className="min-w-0">
                        {heading ? (
                            <h2
                                data-site-title=""
                                className="font-site-heading text-[calc(1.6875rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
                            >
                                {heading}
                            </h2>
                        ) : null}
                        {intro ? (
                            <p className="text-site-body mt-3 max-w-[var(--site-measure,62ch)] whitespace-pre-line text-[length:var(--site-body-size,1rem)] leading-relaxed">
                                {intro}
                            </p>
                        ) : null}
                        {includes.length > 0 ? (
                            <div className="mt-7">
                                {includesLabel ? (
                                    <p className="text-site-muted mb-2 text-[12px] font-semibold uppercase tracking-[0.1em]">
                                        {includesLabel}
                                    </p>
                                ) : null}
                                <ul aria-label={includesLabel ?? undefined}>
                                    {includes.map((line, i) => (
                                        <li
                                            key={i}
                                            className="border-site-border text-site-body border-t py-2.5 text-[15px] leading-snug"
                                        >
                                            {line}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {card}
            </div>
        </section>
    );
}

function PriceCard({
    content,
    service,
    bookHref,
}: {
    content: RenderedServicesList;
    service: PublicService;
    bookHref?: string;
}) {
    const price =
        content.showPrices !== false
            ? formatPrice(service.priceCents, service.currency)
            : null;
    const duration = formatDuration(service.durationMinutes);
    const mode = said(content.modeLine);
    const followUp = said(content.followUpLine);
    const words = said(content.buttonLabel) ?? "Book";
    const button = cn(
        "inline-flex min-h-11 w-full items-center justify-center rounded-[var(--site-radius)] bg-site-accent px-4 text-[15px] font-semibold text-site-accent-fg",
    );
    return (
        <div
            data-price-card=""
            className="border-site-border bg-site-surface rounded-[calc(var(--site-radius)*1.4)] border p-6"
        >
            <h3 className="text-site-muted text-[12px] font-semibold uppercase tracking-[0.1em]">
                {service.name}
            </h3>
            {price ? (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-site-heading text-[calc(2.25rem*var(--site-heading-scale))] font-medium tabular-nums leading-none tracking-[-0.02em]">
                        {price}
                    </span>
                    <span className="text-site-muted text-[14px]">
                        for {duration}
                    </span>
                </p>
            ) : (
                <p className="font-site-heading mt-3 text-[calc(1.5rem*var(--site-heading-scale))] font-medium">
                    {duration}
                </p>
            )}
            {mode ? (
                <p className="text-site-body mt-2 text-[14px]">{mode}</p>
            ) : null}
            <div className="mt-5">
                {content.cta ? (
                    <CtaButton content={content.cta} />
                ) : bookHref ? (
                    <a
                        href={serviceHref(bookHref, service.id)}
                        aria-label={`${words}: ${service.name}`}
                        className={cn(
                            button,
                            "cursor-pointer transition-opacity hover:opacity-90",
                            focusRing,
                        )}
                    >
                        {words}
                    </a>
                ) : (
                    // The editor's canvas has no booking page: the words
                    // show, and go nowhere.
                    <span className={button}>{words}</span>
                )}
            </div>
            {followUp ? (
                <p className="text-site-muted mt-3 text-[13px] leading-relaxed">
                    {followUp}
                </p>
            ) : null}
        </div>
    );
}
