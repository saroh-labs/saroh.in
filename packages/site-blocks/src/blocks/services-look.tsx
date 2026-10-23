"use client";

import type { LookId, RenderedServicesList } from "@saroh/block-contract";
import { sectionFrameOf } from "@saroh/block-contract";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import { LookIcon } from "../look-icons";
import { useQrSource, withQrSource } from "../qr-source";
import {
    FRONT_RING,
    FRONT_TYPE,
    FRONT_WRAP,
    frontButton,
    FrontCta,
    LookEyebrow,
    said,
} from "./look-front";
import type { PublicService } from "./service-words";
import { formatDuration, lookPriceWords } from "./service-words";

/**
 * The services list under a look (DEC-172, plan U6, #1094), as each
 * look's Home board draws it (VA01, VD01, VB01):
 *
 * - **Folio**: index rows beside the section's heading from 700px, under
 *   it on a phone; the name in the display face with an arrow, its line
 *   and how long, the price and a quiet Book.
 * - **Quiet**: hairline rows in a narrow centred column; on a desk the
 *   name and its line, how long, and the price in three columns; on a
 *   phone the name and how long beside the price. The whole row is the
 *   way in: no Book of its own.
 * - **Live**: on a phone, rows in a white card, a tile with how long, the
 *   name, how long and the price, and a soft Book; on a desk, cards with
 *   that tile on top, the name and price, the line and a Book link.
 *
 * Every row is a link through its name, stretched over the row; Book is a
 * sibling link of 44px laid over it, never nested inside it. Both open the
 * booking page on that service (service pages are Phase 2). Services have
 * no photos, so no row has a picture frame; Live draws its tile instead.
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
    const eyebrow = sectionFrameOf(content).eyebrow;
    const head =
        heading || intro || eyebrow ? (
            <div
                className={cn(
                    "grid gap-3 pb-6 min-[700px]:pb-10",
                    look === "quiet" &&
                        "min-[700px]:gap-4 min-[700px]:pb-14 min-[700px]:text-center",
                )}
            >
                <LookEyebrow content={content} look={look} />
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
                        ? "min-[700px]:grid min-[700px]:grid-cols-[5fr_7fr] min-[700px]:items-start min-[700px]:gap-[72px]"
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
                            <div className="max-[699px]:hidden">{cta}</div>
                        </div>
                        <div>
                            {body}
                            <div className="min-[700px]:hidden">{cta}</div>
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
    const quiet = look === "quiet";
    return (
        <ul
            className={cn(
                live
                    ? // VB01: rows in a white card on a phone, cards on a desk.
                      "bg-site-surface rounded-site-photo px-4 min-[700px]:grid min-[700px]:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] min-[700px]:gap-4 min-[700px]:bg-transparent min-[700px]:px-0"
                    : "border-site-border border-t",
            )}
        >
            {services.map((service, i) => {
                const price = showPrices ? lookPriceWords(service) : null;
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
                            look === "folio" &&
                                "inline-flex items-center gap-1.5",
                            FRONT_RING,
                        )}
                    >
                        {service.name}
                        {look === "folio" ? (
                            <LookIcon name="arrow" look={look} size={16} />
                        ) : null}
                    </a>
                ) : (
                    service.name
                );
                // VD01: the whole row is the way in, with no Book of its own.
                const book = quiet ? null : href ? (
                    <a
                        href={href}
                        aria-label={`${words}: ${service.name}`}
                        className={frontButton(
                            look,
                            "quiet",
                            cn(
                                "relative z-10 shrink-0",
                                // VB01's desk card books with a link.
                                live &&
                                    "min-[700px]:justify-self-end min-[700px]:bg-transparent min-[700px]:px-0 min-[700px]:underline min-[700px]:decoration-[1.5px] min-[700px]:underline-offset-[3px]",
                            ),
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
                if (live) {
                    return (
                        <li
                            key={service.id}
                            data-service-row=""
                            className={cn(
                                "min-[700px]:rounded-site-photo min-[700px]:bg-site-surface relative flex items-center gap-4 py-4 min-[700px]:grid min-[700px]:content-start min-[700px]:gap-1.5 min-[700px]:p-3 min-[700px]:pb-[18px]",
                                i < services.length - 1 &&
                                    "border-site-border border-b min-[700px]:border-b-0",
                            )}
                        >
                            <LiveTile
                                name={service.name}
                                minutes={service.durationMinutes}
                                duration={duration}
                            />
                            <div className="grid min-w-0 flex-1 gap-1.5 min-[700px]:px-2 min-[700px]:pt-1.5">
                                <div className="flex items-baseline justify-between gap-4">
                                    <h3
                                        className={cn(
                                            type.name,
                                            "min-[700px]:font-site-heading [overflow-wrap:anywhere] min-[700px]:text-[19px] min-[700px]:leading-[1.2] min-[700px]:tracking-[-0.01em] min-[700px]:[font-stretch:80%]",
                                        )}
                                    >
                                        {name}
                                    </h3>
                                    {price ? (
                                        <span
                                            className={cn(
                                                type.price,
                                                "max-[699px]:hidden",
                                            )}
                                        >
                                            {price}
                                        </span>
                                    ) : null}
                                </div>
                                {showDescriptions && service.description ? (
                                    <p
                                        className={cn(
                                            type.meta,
                                            "whitespace-pre-line max-[699px]:hidden",
                                        )}
                                    >
                                        {service.description}
                                    </p>
                                ) : null}
                                <p
                                    className={cn(
                                        type.meta,
                                        "min-[700px]:hidden",
                                    )}
                                >
                                    {[duration, price]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </p>
                            </div>
                            {book}
                        </li>
                    );
                }
                return (
                    <li
                        key={service.id}
                        data-service-row=""
                        className={cn(
                            "border-site-border relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b py-5 min-[700px]:gap-x-6",
                            quiet &&
                                "min-[700px]:grid-cols-[minmax(0,1fr)_160px_90px] min-[700px]:py-6",
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
                                        // VD01's phone row is the name and
                                        // how long, no line.
                                        quiet && "max-[699px]:hidden",
                                    )}
                                >
                                    {service.description}
                                </p>
                            ) : null}
                            <p
                                className={cn(
                                    type.meta,
                                    quiet && "min-[700px]:hidden",
                                )}
                            >
                                {duration}
                            </p>
                        </div>
                        {quiet ? (
                            <p className={cn(type.meta, "max-[699px]:hidden")}>
                                {duration}
                            </p>
                        ) : null}
                        <div className="flex items-center justify-end gap-3">
                            {price ? (
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

/**
 * Where VB01 draws a service's photo, which services don't have: a tinted
 * tile with how long it takes (a 76px square on a phone; on a desk, the
 * card's 200px top with the length as a tag and the name's first word).
 */
function LiveTile({
    name,
    minutes,
    duration,
}: {
    name: string;
    minutes: number;
    duration: string;
}) {
    const word = name.split(/\s+/)[0] ?? name;
    return (
        <div
            aria-hidden="true"
            className="bg-site-bg text-site-fg min-[700px]:rounded-site-photo flex size-[76px] min-w-0 shrink-0 flex-col items-center justify-center overflow-hidden rounded-[14px] p-2 [container-type:inline-size] min-[700px]:h-[200px] min-[700px]:w-auto min-[700px]:items-start min-[700px]:justify-between min-[700px]:p-[18px]"
        >
            <span className="bg-site-surface rounded-[9px] px-[9px] py-1 text-[12.5px] font-bold max-[699px]:hidden">
                {duration}
            </span>
            <span className="font-site-heading text-[26px] font-extrabold tabular-nums leading-[0.9] tracking-[-0.03em] [font-stretch:80%] min-[700px]:hidden">
                {minutes}
            </span>
            <span className="text-[12.5px] min-[700px]:hidden">min</span>
            <span
                className="font-site-heading line-clamp-2 min-w-0 max-w-full font-extrabold leading-[0.9] tracking-[-0.03em] [font-stretch:80%] [overflow-wrap:break-word] max-[699px]:hidden"
                // Sized to the card, not the screen, and smaller for a longer
                // word, so "Foundations" stays whole in a narrow card.
                style={{
                    fontSize: `clamp(20px, ${Math.min(17, 160 / word.length)}cqi, 52px)`,
                }}
            >
                {word}
            </span>
        </div>
    );
}
