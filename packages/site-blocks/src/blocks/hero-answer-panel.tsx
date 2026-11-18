"use client";

import type {
    HeroPanelKind,
    LookId,
    RenderedHero,
} from "@saroh/block-contract";
import { SAME_DAY_CALL_WORDS } from "@saroh/block-contract";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { DEFAULT_API_URL } from "../api-url";
import { dateText } from "../booking-flow/model";
import { clockWords } from "../lib/clock";
import { gstOnPriceOf } from "../lib/gst-price";
import { phoneText } from "../lib/phone";
import type { PublicVisit } from "../lib/public-visit";
import { cn } from "../lib/utils";
import { nextFreeWhen, placesLeftWords } from "../live/live-words";
import type { LiveToday } from "../live/next-free";
import { useTodayRead } from "../live/next-free";
import type { LiveRead } from "../live/use-live-read";
import { LookIcon } from "../look-icons";
import { useQrSource, withQrSource } from "../qr-source";
import { AnswerRow, useVisitRead } from "./answer-row";
import { HeroByline } from "./byline";
import { CtaButton, ctaClasses } from "./cta";
import { HeroHeading } from "./hero-heading";
import type { HeroLevel } from "./hero-level";
import { panelHasWords, panelKind } from "./hero-panel";
import { FRONT_WRAP, FrontCta, frontButton, said } from "./look-front";
import type { PublicToday, PublicTodayItem } from "./on-today";
import { todayHref } from "./on-today";
import { PhoneText } from "./phone-text";
import type { PublicService } from "./service-words";
import { formatDuration, servicePriceWords } from "./service-words";

/**
 * The hero's Answer panel layout (`variant: "answer"`, DEC-228, KD14; the
 * LA Hero board): the heading on the left, and beside it (under it on a
 * phone, in the first screen) a card that answers the trade's first
 * question:
 *
 * - **today**: today's classes with places (and one-to-one times), from
 *   the site's `/today` read. Every class full: "Full today · see the
 *   week".
 * - **nextFree**: the soonest time the booking page offers, from the same
 *   read.
 * - **sameDayCall**: "Same-day? Call the desk" (or the owner's words, never
 *   "emergency") and a Call button, to the panel's number or the
 *   business's own.
 * - **consultation**: the booking page's one-to-one service, its price and
 *   length, and Book.
 * - **pick-up**: the owner's order-by and where words.
 *
 * LIVE FACTS ARE READ IN THE BROWSER (R18). The cached page carries the
 * panel's plain way in, "See times", and never a time; a failed read keeps
 * it (DEC-172). Live words are a polite region, never assertive.
 *
 * A panel with nothing true to say draws the hero's Centered layout
 * instead (`fallback`, LOOK_DEFAULT_NEEDS): a consultation whose service is
 * gone, a same-day call with no number, a pick-up with no words, a business
 * with no booking page.
 */

type Kind = HeroPanelKind;

export interface AnswerHeroProps {
    content: RenderedHero;
    look?: LookId;
    level?: HeroLevel;
    siteId?: string | null;
    apiUrl?: string;
    bookHref?: string;
    /** A sample place (fixtures): the answer row and the call number. */
    visit?: PublicVisit;
    /** A sample day (fixtures): Today and Next free. */
    today?: PublicToday;
    /** A sample service (tests): Consultation. */
    service?: PanelService;
    now?: Date;
    /** The hero's Centered layout, drawn when the panel has nothing to say. */
    fallback: ReactNode;
}

export default function AnswerHero(props: AnswerHeroProps) {
    const { content, look, level = 1 } = props;
    const kind = panelKind(content);
    const ownPhone = said(content.panel?.phone);
    const needsVisit = kind === "sameDayCall" && !ownPhone;
    // Every read once, here: the panel draws from these.
    const reads: Reads = {
        today: useToday(props, kind === "today" || kind === "nextFree"),
        service: useConsultation(
            kind === "consultation",
            props.siteId,
            props.apiUrl,
            props.service,
        ),
        visit: useVisitRead(
            needsVisit ? props.siteId : null,
            props.apiUrl,
            needsVisit ? props.visit : undefined,
        ),
    };
    if (answerFallsBack(content, kind, reads)) return <>{props.fallback}</>;

    const second =
        content.secondaryCta?.label.trim() && content.secondaryCta.href.trim()
            ? content.secondaryCta
            : null;
    return (
        <section
            data-site-answer-hero={kind}
            data-site-ground={look ? "page" : "hero"}
            className={cn(
                "w-full py-[var(--site-section-padding)]",
                look
                    ? "bg-site-bg text-site-fg"
                    : "bg-site-hero-bg text-site-hero-fg",
            )}
        >
            <div
                className={cn(
                    look
                        ? FRONT_WRAP
                        : "mx-auto w-full max-w-screen-xl px-5 sm:px-[var(--site-page-margin)]",
                    "grid items-center gap-8 min-[700px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] min-[700px]:gap-14",
                )}
            >
                <div className="flex min-w-0 flex-col items-start gap-5">
                    <HeroHeading
                        level={level}
                        className="font-site-heading text-balance text-[calc(clamp(2.25rem,5vw_+_0.75rem,3.75rem)*var(--site-heading-scale,1))] font-semibold leading-[1.04] tracking-[-0.03em] [overflow-wrap:anywhere]"
                    >
                        {content.heading}
                    </HeroHeading>
                    {content.subheading ? (
                        <p className="max-w-[52ch] text-pretty text-[17px] leading-[1.55] min-[700px]:text-[18px]">
                            <PhoneText
                                text={content.subheading}
                                phone={content.phoneLine}
                            />
                        </p>
                    ) : null}
                    <HeroByline byline={content.byline} />
                    {content.cta || second ? (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                            {content.cta ? (
                                look ? (
                                    <FrontCta
                                        content={content.cta}
                                        look={look}
                                    />
                                ) : (
                                    <CtaButton
                                        content={content.cta}
                                        surface="hero"
                                    />
                                )
                            ) : null}
                            {second ? (
                                look ? (
                                    <FrontCta
                                        content={{ ...second, style: "link" }}
                                        look={look}
                                    />
                                ) : (
                                    <CtaButton
                                        content={{ ...second, style: "link" }}
                                        surface="hero"
                                    />
                                )
                            ) : null}
                        </div>
                    ) : null}
                    {content.answerRow ? (
                        <AnswerRow
                            siteId={props.siteId}
                            apiUrl={props.apiUrl}
                            visit={props.visit}
                            now={props.now}
                            look={look}
                        />
                    ) : null}
                </div>
                <Panel {...props} kind={kind} reads={reads} />
            </div>
        </section>
    );
}

/** A consultation's service, as the booking page offers it. */
export type PanelService = Pick<
    PublicService,
    "id" | "name" | "durationMinutes" | "priceCents" | "currency" | "gst"
>;

type ServiceLoad =
    | { kind: "loading" }
    | { kind: "ready"; service: PanelService | null }
    | { kind: "error" };

/**
 * The booking page's one-to-one service (the first, when it offers more),
 * or null when it offers none or bookings are off.
 */
export function consultationService(
    body: unknown,
): PanelService | null | undefined {
    if (typeof body !== "object" || body === null) return undefined;
    const b = body as { open?: unknown; services?: unknown };
    if (typeof b.open !== "boolean" || !Array.isArray(b.services)) {
        return undefined;
    }
    if (!b.open) return null;
    for (const s of b.services as unknown[]) {
        if (typeof s !== "object" || s === null) continue;
        const v = s as Record<string, unknown>;
        if (
            v.kind === "one" &&
            typeof v.id === "string" &&
            typeof v.name === "string" &&
            typeof v.durationMinutes === "number" &&
            (v.priceCents === null || typeof v.priceCents === "number") &&
            (v.currency === null || typeof v.currency === "string")
        ) {
            return {
                id: v.id,
                name: v.name,
                durationMinutes: v.durationMinutes,
                priceCents: v.priceCents,
                currency: v.currency,
                gst: gstOnPriceOf(v.gst),
            };
        }
    }
    return null;
}

/** One read of the booking page, in the browser (no polling: not a today fact). */
function useConsultation(
    on: boolean,
    siteId: string | null | undefined,
    apiUrl: string | undefined,
    given: PanelService | undefined,
): ServiceLoad {
    const [state, setState] = useState<ServiceLoad>(
        given ? { kind: "ready", service: given } : { kind: "loading" },
    );
    useEffect(() => {
        if (!on || given || !siteId) return;
        let active = true;
        void (async (): Promise<ServiceLoad> => {
            try {
                const res = await fetch(
                    `${apiUrl ?? DEFAULT_API_URL}/public/sites/${encodeURIComponent(siteId)}/booking`,
                    { headers: { accept: "application/json" } },
                );
                if (!res.ok) return { kind: "error" };
                const service = consultationService(
                    await res.json().catch(() => null),
                );
                return service === undefined
                    ? { kind: "error" }
                    : { kind: "ready", service };
            } catch {
                return { kind: "error" };
            }
        })().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [on, given, siteId, apiUrl]);
    return given ? { kind: "ready", service: given } : state;
}

/** The today read, or a sample day drawn as a fresh one. */
function useToday(props: AnswerHeroProps, on: boolean): LiveRead<LiveToday> {
    const sample = props.today;
    const own = useTodayRead(on && !sample ? props.siteId : null, props.apiUrl);
    if (!sample) return own;
    return {
        status: "fresh",
        data: {
            ...sample,
            nextFree:
                (sample as Partial<LiveToday>).nextFree ??
                sample.items.find(
                    (i) => i.kind === "one" || (i.placesLeft ?? 0) > 0,
                ) ??
                null,
        },
        fetchedAt: props.now?.getTime(),
    };
}

interface Reads {
    today: LiveRead<LiveToday>;
    service: ServiceLoad;
    visit: LiveRead<PublicVisit>;
}

/**
 * Whether the hero draws its Centered layout instead, from the content
 * and what the reads have said so far (never while one is on its way).
 */
export function answerFallsBack(
    content: RenderedHero,
    kind: Kind,
    reads: Reads,
): boolean {
    if (!panelHasWords(content)) return true;
    // A booking page that offers nothing (Appointments off): no panel.
    if (
        (kind === "today" || kind === "nextFree") &&
        reads.today.data &&
        !reads.today.data.appointments
    ) {
        return true;
    }
    if (
        kind === "consultation" &&
        reads.service.kind === "ready" &&
        !reads.service.service
    ) {
        return true;
    }
    return (
        kind === "sameDayCall" &&
        !content.panel?.phone?.trim() &&
        reads.visit.data !== undefined &&
        !reads.visit.data.phone
    );
}

/** The card: the look's card corners, or Classic's. */
function Card({
    look,
    kind,
    children,
}: {
    look?: LookId;
    kind: Kind;
    children: ReactNode;
}) {
    return (
        <div
            data-site-answer-panel={kind}
            className={cn(
                "bg-site-surface text-site-fg border-site-border min-w-0 border p-6",
                look
                    ? "rounded-site-photo"
                    : "rounded-[calc(var(--site-radius)*1.4)]",
            )}
        >
            {children}
        </div>
    );
}

/** The panel's title: an h2 under the page's h1, an h3 under a later hero. */
function Title({
    level,
    children,
    aside,
}: {
    level: HeroLevel;
    children: ReactNode;
    aside?: ReactNode;
}) {
    const className =
        "font-site-heading text-site-fg text-[22px] font-semibold leading-[1.2] tracking-[-0.01em]";
    return (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
            {level === 1 ? (
                <h2 data-site-title="" className={className}>
                    {children}
                </h2>
            ) : (
                <h3 data-site-title="" className={className}>
                    {children}
                </h3>
            )}
            {aside ? (
                <span className="text-site-muted shrink-0 text-[14px]">
                    {aside}
                </span>
            ) : null}
        </div>
    );
}

/** The panel's buttons: the look's, or Classic's, always 44px tall. */
function button(
    look: LookId | undefined,
    kind: "fill" | "outline",
    className?: string,
): string {
    return look
        ? frontButton(look, kind, className)
        : cn(
              ctaClasses(kind === "fill" ? "primary" : "secondary"),
              "min-h-11 gap-2 px-5 py-2.5",
              className,
          );
}

const LINK =
    "text-site-fg inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold underline decoration-1 underline-offset-[4px] hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent rounded-[2px]";

/** Muted words on the card: the 12px floor and 4.5:1 hold. */
const LINE = "text-site-body mb-4 text-[15px] leading-[1.5]";

type PanelProps = AnswerHeroProps & { reads: Reads };

function Panel(props: PanelProps & { kind: Kind }) {
    const { kind } = props;
    if (kind === "today") return <TodayPanel {...props} />;
    if (kind === "nextFree") return <NextFreePanel {...props} />;
    if (kind === "sameDayCall") return <CallPanel {...props} />;
    if (kind === "consultation") return <ConsultationPanel {...props} />;
    return <PickupPanel {...props} />;
}

/**
 * The plain way in, the cached page's and a failed read's: words and
 * "See times", never a time (DEC-172). Where no site is live (the
 * editor's canvas), it says what will show instead.
 */
function SeeTimes({
    look,
    bookHref,
    words,
    canvas,
}: {
    look?: LookId;
    bookHref?: string;
    words: string;
    canvas: string | null;
}) {
    return (
        <>
            <p className={LINE}>{canvas ?? words}</p>
            {bookHref ? (
                <Link
                    href={bookHref}
                    className={button(look, "fill", "w-full")}
                >
                    See times
                </Link>
            ) : null}
        </>
    );
}

function TodayPanel(props: PanelProps) {
    const { look, bookHref, level = 1 } = props;
    const read = props.reads.today;
    const source = useQrSource();
    const today = read.data;
    const canvas =
        props.siteId === undefined && !props.today
            ? "Today's classes and free times show here on your live site."
            : null;
    const week = bookHref ? withQrSource(bookHref, source) : null;
    const items = today?.items ?? [];
    const allFull =
        items.length > 0 &&
        items.every((i) => i.kind === "class" && (i.placesLeft ?? 0) <= 0);
    return (
        <Card look={look} kind="today">
            <Title
                level={level}
                aside={today ? dateText(today.date, true) : null}
            >
                On today
            </Title>
            <div aria-live="polite" data-live-state={read.status}>
                {!today ? (
                    <SeeTimes
                        look={look}
                        bookHref={bookHref}
                        words="Today's classes and free times are on the booking page."
                        canvas={canvas}
                    />
                ) : items.length === 0 ? (
                    <p className="text-site-body pt-2 text-[15px]">
                        Nothing more today
                        {week ? (
                            <>
                                {" · "}
                                <Link href={week} className={LINK}>
                                    See the week
                                </Link>
                            </>
                        ) : null}
                    </p>
                ) : (
                    <>
                        <ul>
                            {items.map((item) => (
                                <li
                                    key={`${item.serviceId}:${item.startAt}`}
                                    className="border-site-border grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 border-b py-3 last:border-b-0"
                                >
                                    <TodayRow
                                        item={item}
                                        look={look}
                                        href={
                                            bookHref
                                                ? withQrSource(
                                                      todayHref(bookHref, item),
                                                      source,
                                                  )
                                                : null
                                        }
                                    />
                                </li>
                            ))}
                        </ul>
                        {allFull ? (
                            <p className="text-site-fg pt-3 text-[15px] font-semibold">
                                Full today
                                {week ? (
                                    <>
                                        {" · "}
                                        <Link href={week} className={LINK}>
                                            see the week
                                        </Link>
                                    </>
                                ) : null}
                            </p>
                        ) : week ? (
                            <div className="flex justify-end pt-2">
                                <Link href={week} className={LINK}>
                                    The whole week
                                    <LookIcon
                                        name="arrow"
                                        look={look ?? "quiet"}
                                        size={15}
                                    />
                                </Link>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </Card>
    );
}

/** One of today's times: when, what, with whom, its places and Book. */
function TodayRow({
    item,
    look,
    href,
}: {
    item: PublicTodayItem;
    look?: LookId;
    href: string | null;
}) {
    const full = item.kind === "class" && (item.placesLeft ?? 0) <= 0;
    const tag =
        item.kind === "one"
            ? "Open"
            : full
              ? "Full"
              : (placesLeftWords(item.placesLeft, { short: true }) ?? "Open");
    const who = item.staffName
        ? `${item.staffName} · ${formatDuration(item.durationMinutes)}`
        : formatDuration(item.durationMinutes);
    return (
        <>
            <span className="text-[15px] font-semibold tabular-nums">
                {clockWords(item.time)}
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-[1.25]">
                    {item.serviceName}
                </span>
                <span className="text-site-muted mt-0.5 block text-[13px] leading-[1.3]">
                    {who}
                </span>
            </span>
            <span className="flex items-center gap-2.5">
                <span
                    data-live-count=""
                    className={cn(
                        "whitespace-nowrap text-[13px] font-semibold",
                        full ? "text-site-muted" : "text-site-fg",
                    )}
                >
                    {tag}
                </span>
                {href && !full ? (
                    <Link
                        href={href}
                        aria-label={`Book ${item.serviceName} at ${clockWords(item.time)}`}
                        className={button(look, "outline", "px-4 text-[14px]")}
                    >
                        Book
                    </Link>
                ) : null}
            </span>
        </>
    );
}

function NextFreePanel(props: PanelProps) {
    const { look, bookHref, level = 1 } = props;
    const read = props.reads.today;
    const source = useQrSource();
    const item = read.data?.nextFree ?? null;
    const today = read.data;
    const canvas =
        props.siteId === undefined && !props.today
            ? "Your next free time shows here on your live site."
            : null;
    return (
        <Card look={look} kind="nextFree">
            <Title level={level}>Next free</Title>
            <div aria-live="polite" data-live-state={read.status}>
                {item && today ? (
                    <>
                        <p className={LINE}>
                            {item.serviceName}
                            {item.staffName ? ` with ${item.staffName}` : ""}
                            {" · "}
                            {formatDuration(item.durationMinutes)}
                        </p>
                        <p
                            data-live-value=""
                            className="font-site-heading mb-5 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tabular-nums leading-none tracking-[-0.02em] first-letter:uppercase"
                        >
                            {nextFreeWhen(item, today.date)}
                        </p>
                        {bookHref ? (
                            <div className="flex flex-col items-start gap-1">
                                <Link
                                    href={withQrSource(
                                        todayHref(bookHref, item),
                                        source,
                                    )}
                                    className={button(look, "fill", "w-full")}
                                >
                                    Book {clockWords(item.time)}
                                </Link>
                                <Link
                                    href={withQrSource(bookHref, source)}
                                    className={LINK}
                                >
                                    Other times
                                </Link>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <SeeTimes
                        look={look}
                        bookHref={bookHref}
                        words="Pick a time on the booking page."
                        canvas={canvas}
                    />
                )}
            </div>
        </Card>
    );
}

function CallPanel(props: PanelProps) {
    const { look, content, level = 1 } = props;
    const phone =
        said(content.panel?.phone) ?? said(props.reads.visit.data?.phone);
    const words = said(content.panel?.words) ?? SAME_DAY_CALL_WORDS;
    return (
        <Card look={look} kind="sameDayCall">
            <Title level={level}>{words}</Title>
            <p className={LINE}>Ask the desk for the earliest time today.</p>
            {phone ? (
                <a
                    href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                    className={button(look, "outline", "w-full")}
                >
                    <LookIcon name="call" look={look ?? "quiet"} size={16} />
                    Call {phoneText(phone)}
                </a>
            ) : props.siteId === undefined && !props.visit ? (
                <p className="text-site-muted text-[14px]">
                    Your business phone shows here on your live site.
                </p>
            ) : (
                // Held at the button's height until the number is read.
                <div aria-hidden="true" className="min-h-11" />
            )}
        </Card>
    );
}

function ConsultationPanel(props: PanelProps) {
    const { look, bookHref, content, level = 1 } = props;
    const load = props.reads.service;
    const service = load.kind === "ready" ? load.service : null;
    const price = service ? servicePriceWords(service) : null;
    const words = said(content.panel?.words);
    const canvas =
        props.siteId === undefined && !props.service
            ? "Your consultation's price and length show here on your live site."
            : null;
    return (
        <Card look={look} kind="consultation">
            {service ? (
                <>
                    <Title level={level}>{service.name}</Title>
                    <p className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        {price ? (
                            <span className="font-site-heading text-[clamp(2rem,4vw,3rem)] font-semibold tabular-nums leading-none tracking-[-0.02em]">
                                {price}
                            </span>
                        ) : null}
                        <span className="text-site-muted text-[15px]">
                            {formatDuration(service.durationMinutes)}
                        </span>
                    </p>
                    {words ? <p className={LINE}>{words}</p> : null}
                    {bookHref ? (
                        <Link
                            href={`${bookHref}?${new URLSearchParams({ service: service.id }).toString()}`}
                            className={button(look, "fill", "w-full")}
                        >
                            Book a consultation
                        </Link>
                    ) : null}
                </>
            ) : (
                <>
                    <Title level={level}>Consultation</Title>
                    <SeeTimes
                        look={look}
                        bookHref={bookHref}
                        words={
                            words ?? "Prices and times are on the booking page."
                        }
                        canvas={canvas}
                    />
                </>
            )}
        </Card>
    );
}

/** A clock, for Pickup's order-by line (the look icons have none). */
function ClockIcon() {
    return (
        <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            aria-hidden="true"
            className="block shrink-0"
        >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
        </svg>
    );
}

function PickupPanel(props: PanelProps & { kind: Kind }) {
    const { look, content, level = 1 } = props;
    const orderBy = content.panel?.orderBy?.trim();
    const where = content.panel?.where?.trim();
    const fact =
        "border-site-border flex items-start gap-3 border-b py-3 text-[15px] leading-[1.5] last:border-b-0";
    return (
        <Card look={look} kind={props.kind}>
            <Title level={level}>Pick-up</Title>
            <ul>
                {orderBy ? (
                    <li className={fact}>
                        <span className="text-site-accent-text mt-0.5">
                            <ClockIcon />
                        </span>
                        <span className="text-site-fg font-semibold">
                            {orderBy}
                        </span>
                    </li>
                ) : null}
                {where ? (
                    <li className={fact}>
                        <span className="text-site-accent-text mt-0.5">
                            <LookIcon
                                name="pin"
                                look={look ?? "quiet"}
                                size={20}
                            />
                        </span>
                        <span className="text-site-fg">{where}</span>
                    </li>
                ) : null}
            </ul>
        </Card>
    );
}
