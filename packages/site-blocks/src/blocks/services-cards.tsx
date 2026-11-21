"use client";

import type { LookId } from "@saroh/block-contract";

import { cn } from "../lib/utils";
import { useQrSource, withQrSource } from "../qr-source";
import { SiteLink } from "../site-link";
import { frontButton } from "./look-front";
import type { PublicService } from "./service-words";
import { formatDuration, servicePriceWords } from "./service-words";

export const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/*
 * The design's card button: the merchant's accent, the site's radius.
 * 38px under a mouse, 44px under a finger.
 */
const cardButton =
    "coarse:h-11 inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-[var(--site-radius)] bg-site-accent px-3.5 text-[13.5px] font-bold text-site-accent-fg";

/**
 * The booking page, opened on one service. On a page a QR code's scan
 * opened, the link carries the scan's tag on (`qr-source.ts`).
 */
export function serviceHref(
    bookHref: string,
    serviceId: string,
    source: string | null,
): string {
    return withQrSource(
        `${bookHref}?service=${encodeURIComponent(serviceId)}`,
        source,
    );
}

/** Said under a service with nothing free soon; Book stays beside it. */
export const NO_TIMES_YET = "No times yet";

/**
 * "No times yet · Ask" (BLOCK-MAP §3, Services SO): the service has no time
 * free this fortnight, so a visitor is offered the enquiry form as well as
 * Book. Nothing when the read doesn't say so.
 */
export function NoTimesYet({
    service,
    askHref,
}: {
    service: PublicService;
    askHref?: string | null;
}) {
    if (service.noTimesSoon !== true) return null;
    return (
        <span data-no-times="" className="text-site-muted text-[13px]">
            {NO_TIMES_YET} ·{" "}
            {askHref ? (
                <SiteLink
                    href={askHref}
                    aria-label={`Ask about ${service.name}`}
                    className={cn(
                        "text-site-accent-text coarse:min-h-11 inline-flex items-center rounded-sm font-semibold underline underline-offset-4 hover:no-underline max-[699px]:min-h-11",
                        focusRing,
                    )}
                >
                    Ask
                </SiteLink>
            ) : (
                "Ask"
            )}
        </span>
    );
}

/**
 * The `cards` look (DEC-237), which is also the older "Show as: Cards"
 * (G16): the services side by side, as the Customer Site design draws a
 * Book page — how long, the name, a line about it, the price and a button
 * that opens the booking page on that service. Content that chose cards
 * before the look existed resolves to it (`variants.ts`), so it draws as
 * it always did.
 */
export function ServiceCards({
    services,
    showPrices,
    showDescriptions,
    label,
    bookHref,
    askHref,
    look,
}: {
    services: PublicService[];
    showPrices: boolean;
    showDescriptions: boolean;
    /** The merchant's button words; null keeps "Book". */
    label: string | null;
    bookHref?: string;
    /** The enquiry form, for a service with no times soon. */
    askHref?: string | null;
    /** Under a look, a card takes the look's card corner, not its button's. */
    look?: LookId;
}) {
    const source = useQrSource();
    const words = label ?? "Book";
    return (
        <ul className="mt-8 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
            {services.map((service) => {
                const price = showPrices ? servicePriceWords(service) : null;
                return (
                    <li
                        key={service.id}
                        className={
                            look
                                ? "border-site-border bg-site-surface text-site-fg rounded-site-s grid min-w-0 content-start gap-1.5 overflow-hidden border p-4"
                                : "border-site-border bg-site-surface text-site-fg grid min-w-0 content-start gap-1.5 overflow-hidden rounded-[calc(var(--site-radius)*1.4)] border p-4"
                        }
                    >
                        <span className="text-site-muted text-[12px] font-bold uppercase tracking-[0.08em]">
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
                                <SiteLink
                                    href={serviceHref(
                                        bookHref,
                                        service.id,
                                        source,
                                    )}
                                    aria-label={`${words}: ${service.name}`}
                                    className={
                                        // Under a look, one filled button a
                                        // view: a card's Book is quiet.
                                        look
                                            ? frontButton(look, "quiet")
                                            : cn(
                                                  cardButton,
                                                  "cursor-pointer transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]",
                                                  focusRing,
                                              )
                                    }
                                >
                                    {words}
                                </SiteLink>
                            ) : (
                                <span
                                    className={
                                        look
                                            ? frontButton(look, "quiet")
                                            : cardButton
                                    }
                                >
                                    {words}
                                </span>
                            )}
                        </span>
                        <NoTimesYet service={service} askHref={askHref} />
                    </li>
                );
            })}
        </ul>
    );
}
