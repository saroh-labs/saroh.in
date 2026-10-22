"use client";

import type { LookId, RenderedServicesList } from "@saroh/block-contract";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import { useQrSource, withQrSource } from "../qr-source";
import {
    FRONT_RING,
    FRONT_TYPE,
    FRONT_WRAP,
    FrontCta,
    frontButton,
    said,
} from "./look-front";
import type { PublicService } from "./service-words";
import { formatDuration, servicePriceWords } from "./service-words";

/**
 * The services list under a look (DEC-172, plan U6, #1094), as each
 * look's Home board draws it (VA01, VD01, VB01):
 *
 * - **Folio**: index rows beside the section's heading on a desk, under it
 *   on a phone; the name in the display face, its line and how long, the
 *   price and a quiet Book.
 * - **Quiet**: hairline rows in a narrow centred column; the name, how
 *   long, the price and a pill Book.
 * - **Live**: rows in a white card; the name in bold, how long and the
 *   price under it, and a soft Book.
 *
 * Every row is a link through its name, stretched over the row; Book is a
 * sibling link of 44px laid over it, never nested inside it. Both open the
 * booking page on that service (service pages are Phase 2). No row has a
 * thumbnail: services have no photos, so none is ever an empty frame.
 *
 * The merchant's own choices are kept: their heading and line, prices and
 * descriptions shown or hidden, their button words, and their button.
 * Loading keeps the list's shape; a failed read says so with Try again,
 * as the Classic list does.
 */

export type ServicesLoad =
    | { kind: "loading" }
    | { kind: "ready"; services: PublicService[] }
    | { kind: "error" };

export default function LookServices({
    content,
    look,
    state,
    retry,
    bookHref,
}: {
    content: RenderedServicesList;
    look: LookId;
    state: ServicesLoad;
    retry: () => void;
    bookHref?: string;
}) {
    const type = FRONT_TYPE[look];
    const heading = said(content.heading);
    const intro = said(content.intro);
    const head =
        heading || intro ? (
            <div
                className={cn(
                    "grid gap-3 pb-6 min-[700px]:pb-10",
                    look === "quiet" && "min-[700px]:text-center",
                )}
            >
                {heading ? (
                    <h2 data-site-title="" className={type.h2}>
                        {heading}
                    </h2>
                ) : null}
                {intro ? (
                    <p
                        className={cn(
                            "text-site-body max-w-[60ch] text-[16px] leading-relaxed",
                            look === "quiet" && "min-[700px]:mx-auto",
                        )}
                    >
                        {intro}
                    </p>
                ) : null}
            </div>
        ) : null;

    const body =
        state.kind === "loading" ? (
            <div
                role="status"
                aria-label="Loading services"
                data-services-loading=""
                className="border-site-border border-t"
            >
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        aria-hidden="true"
                        className="border-site-border grid gap-2.5 border-b py-5"
                    >
                        <span className="bg-site-border rounded-site-s block h-4 w-2/5" />
                        <span className="bg-site-border rounded-site-s block h-3 w-3/4 opacity-60" />
                    </div>
                ))}
            </div>
        ) : state.kind === "error" ? (
            <div>
                <p role="alert" className={destructiveAlertClasses}>
                    We couldn&apos;t load our services right now. Please try
                    again shortly.
                </p>
                <button
                    type="button"
                    onClick={retry}
                    className={frontButton(look, "outline", "mt-3")}
                >
                    Try again
                </button>
            </div>
        ) : (
            <Rows
                look={look}
                services={state.services}
                showPrices={content.showPrices !== false}
                showDescriptions={content.showDescriptions !== false}
                label={said(content.buttonLabel)}
                bookHref={bookHref}
            />
        );

    const cta = content.cta ? (
        <div
            className={cn(
                "pt-6 min-[700px]:pt-8",
                look === "quiet" && "min-[700px]:text-center",
            )}
        >
            <FrontCta content={content.cta} look={look} />
        </div>
    ) : null;

    return (
        <section
            data-site-look-services={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div
                className={cn(
                    FRONT_WRAP,
                    look === "folio" && head
                        ? "min-[1000px]:grid min-[1000px]:grid-cols-[5fr_7fr] min-[1000px]:items-start min-[1000px]:gap-[72px]"
                        : undefined,
                )}
            >
                {look === "quiet" ? (
                    <div className="mx-auto max-w-[760px]">
                        {head}
                        {body}
                        {cta}
                    </div>
                ) : look === "folio" ? (
                    <>
                        <div>
                            {head}
                            <div className="max-[999px]:hidden">{cta}</div>
                        </div>
                        <div>
                            {body}
                            <div className="min-[1000px]:hidden">{cta}</div>
                        </div>
                    </>
                ) : (
                    <>
                        {head}
                        {body}
                        {cta}
                    </>
                )}
            </div>
        </section>
    );
}

/** The rows, in the look's shape. */
function Rows({
    look,
    services,
    showPrices,
    showDescriptions,
    label,
    bookHref,
}: {
    look: LookId;
    services: PublicService[];
    showPrices: boolean;
    showDescriptions: boolean;
    /** The merchant's button words; null keeps "Book". */
    label: string | null;
    bookHref?: string;
}) {
    const source = useQrSource();
    const type = FRONT_TYPE[look];
    const words = label ?? "Book";
    const live = look === "live";
    return (
        <ul
            className={cn(
                live
                    ? "bg-site-surface rounded-site-photo px-4 min-[700px]:px-6"
                    : "border-site-border border-t",
            )}
        >
            {services.map((service, i) => {
                const price = showPrices ? servicePriceWords(service) : null;
                const href = bookHref
                    ? withQrSource(
                          `${bookHref}?service=${encodeURIComponent(service.id)}`,
                          source,
                      )
                    : null;
                const duration = formatDuration(service.durationMinutes);
                const name = href ? (
                    <a
                        href={href}
                        data-service-row-link=""
                        className={cn(
                            "after:absolute after:inset-0 after:content-['']",
                            "rounded-site-s cursor-pointer hover:underline hover:decoration-1 hover:underline-offset-4",
                            FRONT_RING,
                        )}
                    >
                        {service.name}
                    </a>
                ) : (
                    service.name
                );
                const book = href ? (
                    <a
                        href={href}
                        aria-label={`${words}: ${service.name}`}
                        className={frontButton(
                            look,
                            live
                                ? "quiet"
                                : look === "quiet"
                                  ? "outline"
                                  : "quiet",
                            "relative z-10 shrink-0",
                        )}
                    >
                        {words}
                    </a>
                ) : label ? (
                    // The editor's canvas has no booking page: the words
                    // show, and go nowhere.
                    <span className={frontButton(look, "quiet", "shrink-0")}>
                        {label}
                    </span>
                ) : null;
                return (
                    <li
                        key={service.id}
                        data-service-row=""
                        className={cn(
                            "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5",
                            live
                                ? cn(
                                      "py-4",
                                      i < services.length - 1 &&
                                          "border-site-border border-b",
                                  )
                                : "border-site-border border-b py-5 min-[700px]:gap-x-6",
                            look === "quiet" && "min-[700px]:py-6",
                        )}
                    >
                        <div className="grid min-w-0 gap-1">
                            <h3
                                className={cn(
                                    type.name,
                                    "[overflow-wrap:anywhere]",
                                )}
                            >
                                {name}
                            </h3>
                            {showDescriptions && service.description ? (
                                <p
                                    className={cn(
                                        type.meta,
                                        "whitespace-pre-line",
                                        live && "max-[699px]:line-clamp-2",
                                    )}
                                >
                                    {service.description}
                                </p>
                            ) : null}
                            <p className={type.meta}>
                                {duration}
                                {live && price ? (
                                    <>
                                        {" · "}
                                        <span className={type.price}>
                                            {price}
                                        </span>
                                    </>
                                ) : null}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {!live && price ? (
                                <span className={type.price}>{price}</span>
                            ) : null}
                            {book}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
