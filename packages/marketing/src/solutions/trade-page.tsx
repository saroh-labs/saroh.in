import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../cn";
import type { ClaimSwitch } from "../content/feature-switches";
import { Chip } from "../kit/chip";
import { ClosingCTA } from "../kit/closing-cta";
import { DayScene } from "../kit/day-scene";
import { HourStrip } from "../kit/hour-strip";
import { PhoneClip, PhoneFold } from "../kit/phone-fold";
import { StickyBar } from "../kit/sticky-bar";
import { SunArc } from "../kit/sun-arc";
import { SwipeRow } from "../kit/swipe-row";
import { hourAnchor, hourLabel, hourTint } from "../kit/time";
import { TradeSwitcher } from "../kit/trade-switcher";
import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import { ring } from "../ring";
import { FaqItems } from "../sections/faq";
import { SplitHero } from "../sections/split-hero";
import type { DayHour, TradeDay, UsedLink } from "./day";
import { HomePhone, Moment } from "./moments/moments";
import type { MomentData } from "./moments/types";
import { say } from "./words";

/** A feature's chip: its name and page, or nothing while it is switched off. */
export interface FeatureLink {
    label: string;
    href: string;
}

/** The words every trade page shares; an edition writes them (saroh.in's `content/solutions-trade.ts`). */
export interface TradePageWords {
    crumb: string;
    draft: string;
    noCard: string;
    problems: string;
    problemsLine: string;
    problemHow: string;
    used: string;
    /** A feature chip's tail: "how it works". */
    how: string;
    /** Another link's tail: "see it". */
    seeIt: string;
    others: string;
    othersLine: string;
    followDay: (kind: string) => string;
    tradeBar: string;
    allTradesShort: string;
    /** On a phone, an hour's whole story folds behind this. */
    wholeHour: string;
    /** A scene's cut pictures, when none of them names its own fold. */
    wholePicture: string;
    /** On a phone, the questions past three fold behind this. */
    allQuestions: string;
}

/** A problem the trade knows, and its folded answer. */
export interface TradeProblem {
    quote: string;
    /** Beside the quote: "Orders". */
    area?: string;
    title?: string;
    body?: string;
    /** The feature that answers it: its link, and its hour in the day. */
    feature?: string;
    /** The link's words, instead of the feature's name. */
    link?: string;
    /** A picture of the answer, in the fold under its words. */
    picture?: ReactNode;
}

/** Where a start button sits: the trade bar, the hero, the closing, the phone's sticky bar. */
export type TradeCtaPlace = "bar" | "hero" | "closing" | "sticky";

export interface TradePageLayoutProps {
    slug: string;
    name: string;
    h1: string;
    lead: string;
    phoneLead?: string;
    words: TradePageWords;
    /** The hub: the crumb, the bar's "All trades" and the closing link. */
    hubHref: string;
    /** Another trade's page (the bar, the other days). */
    tradeHref: (slug: string) => string;
    draft?: boolean;
    /** The written day, where there is one. */
    day?: TradeDay;
    /** The other written days, for "Same day, other trades". */
    otherDays: readonly TradeDay[];
    /** The edition's start button at each place. */
    cta: (place: TradeCtaPlace) => ReactNode;
    /** Beside the hero's start button when there is no day: the live demo. */
    heroLink?: { href: string; label: string };
    /** The hero's picture when there is no day. */
    picture: ReactNode;
    /** A feature's chip, or undefined while its page is off. */
    feature: (slug: string) => FeatureLink | undefined;
    claimOn: (claim: ClaimSwitch) => boolean;
    templatesOn: boolean;
    freeLine?: ReactNode;
    problems: { items: readonly TradeProblem[]; line?: string };
    /** What changes: open after the problems, or folded after a day under `folded`. */
    changes?: { title: string; folded: string; children: ReactNode };
    /** The template and what to add first. */
    starter?: {
        title: string;
        line: string;
        rows: readonly { name: string; detail: string }[];
        template?: {
            title: string;
            description: string;
            links: readonly { href: string; label: string }[];
        };
    };
    pricing?: { title: string; children: ReactNode };
    faq: { title: string; items: { q: string; a: string }[] };
    related: {
        title: string;
        items: readonly { slug: string; name: string; href?: string }[];
    };
    allTrades: { label: string; line: string };
    closing: { title: string; secondary: ReactNode; note: string };
    /** The trade bar's trades: the written days' and the lead ones. */
    bar: readonly { slug: string; label: string }[];
}

const SECTION = "py-10 min-[760px]:py-[120px]";
const H2 = "m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]";
const BODY = "m-0 text-[16px] leading-relaxed text-mk-copy";

function UsedChips({
    used,
    feature,
    templatesOn,
    words: W,
}: {
    used: readonly UsedLink[];
    feature: TradePageLayoutProps["feature"];
    templatesOn: boolean;
    words: TradePageWords;
}) {
    const chips = used.flatMap((u) => {
        if ("feature" in u) {
            const f = feature(u.feature);
            return f ? [{ label: f.label, href: f.href, tail: W.how }] : [];
        }
        if (u.needs === "templates" && !templatesOn) return [];
        return [{ label: u.label, href: u.href, tail: W.seeIt }];
    });
    if (chips.length === 0) return null;
    return (
        // A phone keeps the chips on one line that scrolls (PHONE.md: one row of chips).
        <div className="flex items-center gap-2.5 max-[759px]:-mr-mk-gutter max-[759px]:overflow-x-auto max-[759px]:whitespace-nowrap max-[759px]:pr-mk-gutter max-[759px]:[scrollbar-width:none] min-[760px]:contents">
            <span className="shrink-0 text-[14px] text-mk-copy">{W.used}</span>
            {chips.map((c) => (
                // Own ink, so a chip on the night band keeps its words dark on white.
                <Chip
                    key={c.href}
                    variant="chapter"
                    href={c.href}
                    className="text-[hsl(var(--foreground))]"
                >
                    {c.label}
                    <span className="font-normal text-[hsl(var(--mk-body))] max-[759px]:sr-only">
                        &nbsp;· {c.tail}
                    </span>
                </Chip>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ hero */

function TradeBar({
    slug,
    name,
    day,
    bar,
    cta,
    hubHref,
    tradeHref,
    words: W,
}: Pick<
    TradePageLayoutProps,
    "slug" | "name" | "day" | "bar" | "cta" | "hubHref" | "tradeHref" | "words"
>) {
    const options = [
        ...(bar.some((b) => b.slug === slug)
            ? []
            : [{ id: slug, label: name }]),
        ...bar.map((b) => ({
            id: b.slug,
            label: b.label,
            href: tradeHref(b.slug),
        })),
        { id: "all", label: W.allTradesShort, href: hubHref },
    ];
    return (
        <div className="sticky top-[var(--mk-nav-h)] z-20 border-y border-border bg-background/95 backdrop-blur-[6px]">
            <Container className="flex h-[60px] items-center gap-4 min-[760px]:h-[68px]">
                <TradeSwitcher
                    legend={W.tradeBar}
                    value={slug}
                    options={options}
                    className="min-w-0 [&>span]:max-[759px]:sr-only"
                />
                {day ? (
                    <p className="m-0 ml-auto hidden items-center gap-2.5 text-[14px] text-mk-copy min-[1100px]:flex">
                        <span className="font-mono text-[13px] text-foreground">
                            {day.date}
                        </span>
                        {day.example}
                    </p>
                ) : null}
                <span
                    className={cn(
                        "hidden min-[1100px]:block",
                        !day && "ml-auto",
                    )}
                >
                    {cta("bar")}
                </span>
            </Container>
        </div>
    );
}

/** A problem's answer: its title, words, picture and the feature it uses. */
function Answer({
    x,
    f,
}: {
    x: TradeProblem;
    f: { href: string; label: string } | undefined;
}) {
    return (
        <>
            {x.title ? (
                <h3 className="m-0 text-[16px] font-semibold">{x.title}</h3>
            ) : null}
            {x.body ? <p className={BODY}>{x.body}</p> : null}
            {x.picture ? <div className="mt-2">{x.picture}</div> : null}
            {f ? (
                <TextLink href={f.href} tone="ink" arrow>
                    {x.link ?? f.label}
                </TextLink>
            ) : null}
        </>
    );
}

/* ------------------------------------------------------------------ problems */

function Problems({
    items,
    line,
    day,
    feature,
    words: W,
}: {
    items: readonly TradeProblem[];
    line?: string;
    day?: TradeDay;
    feature: TradePageLayoutProps["feature"];
    words: TradePageWords;
}) {
    const hourOf = (slug?: string) =>
        slug && day
            ? [day.start, ...day.hours].find((h) =>
                  h.used.some((u) => "feature" in u && u.feature === slug),
              )
            : undefined;
    return (
        <section
            aria-labelledby="problems-title"
            className={cn("border-t border-border", SECTION)}
        >
            <Container className="grid grid-cols-[minmax(0,1fr)] gap-10 min-[1000px]:grid-cols-[400px_minmax(0,1fr)] min-[1000px]:gap-16">
                <div className="grid content-start gap-4">
                    <h2 id="problems-title" className={H2}>
                        {W.problems}
                    </h2>
                    <p className={BODY}>
                        {day?.problemsLine ?? line ?? W.problemsLine}
                    </p>
                </div>
                <SwipeRow label={W.problems} columns={1}>
                    {items.map((x) => {
                        const f = x.feature ? feature(x.feature) : undefined;
                        const hour = hourOf(x.feature);
                        return (
                            <article
                                key={x.quote}
                                className="grid h-full content-start gap-3 rounded-mk-card border border-border bg-card p-5 min-[760px]:rounded-none min-[760px]:border-x-0 min-[760px]:border-t-0 min-[760px]:bg-transparent min-[760px]:px-0 min-[760px]:py-4"
                            >
                                <div className="grid gap-3 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-center">
                                    <p className="m-0 text-[18px] leading-snug min-[760px]:text-[19px]">
                                        {x.quote}
                                    </p>
                                    <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                                        {hour ? (
                                            <a
                                                href={`#${hour.anchor}`}
                                                className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[13px] font-medium no-underline hover:border-foreground"
                                            >
                                                {anchorLabel(hour.anchor)}
                                            </a>
                                        ) : null}
                                        {x.area ?? null}
                                    </p>
                                </div>
                                {x.title || x.body ? (
                                    // An answer with a picture stays open (owner, 16 Nov:
                                    // screens are never behind a click); words only fold.
                                    x.picture ? (
                                        <div className="grid gap-1.5 pb-2">
                                            <Answer x={x} f={f} />
                                        </div>
                                    ) : (
                                        <details className="group">
                                            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14px] font-medium text-mk-copy [&::-webkit-details-marker]:hidden">
                                                {W.problemHow}
                                                <ChevronDown
                                                    aria-hidden
                                                    className="size-5 transition-transform group-open:rotate-180"
                                                />
                                            </summary>
                                            <div className="grid gap-1.5 pb-2">
                                                <Answer x={x} f={f} />
                                            </div>
                                        </details>
                                    )
                                ) : null}
                            </article>
                        );
                    })}
                </SwipeRow>
            </Container>
        </section>
    );
}

/** "9am" → "9 am", "tue7am" → "Tue 7 am". */
function anchorLabel(anchor: string): string {
    const m = /^(tue)?(\d+)(am|pm)$/.exec(anchor);
    if (!m) return anchor;
    return `${m[1] ? "Tue " : ""}${m[2]} ${m[3]}`;
}
function anchorAt(anchor: string): string {
    const m = /(\d+)(am|pm)$/.exec(anchor);
    if (!m) return "12:00";
    const h = (Number(m[1]) % 12) + (m[2] === "pm" ? 12 : 0);
    return `${String(h).padStart(2, "0")}:00`;
}

/* ------------------------------------------------------------------ the day */

/** Where a scene's pictures are cut on a phone, by its first moment's kind. */
/** On a phone, while the hour's toggle is open (its `<section>` is the DayScene). */
const OPENED = {
    inline: "max-[759px]:[section:has([data-pc=toggle][open])_&]:inline",
    block: "max-[759px]:[section:has([data-pc=toggle][open])_&]:block",
    gone: "max-[759px]:[section:has([data-pc=toggle][open])_&]:hidden",
};

const CLIP: Partial<Record<MomentData["kind"], number>> = {
    "site-order": 210,
    post: 200,
    payment: 240,
    bill: 210,
    "ai-app": 210,
    ask: 230,
    enquiry: 210,
    shelf: 190,
};

function Hour({
    hour,
    claimOn,
    feature,
    templatesOn,
    words,
}: {
    hour: DayHour;
    claimOn: TradePageLayoutProps["claimOn"];
    feature: TradePageLayoutProps["feature"];
    templatesOn: boolean;
    words: TradePageWords;
}) {
    const at = anchorAt(hour.anchor);
    const moments = hour.claimed
        ? claimOn(hour.claimed.claim)
            ? hour.claimed.on
            : hour.claimed.off
        : hour.moments;
    const after = hour.after ? say(hour.after, claimOn) : "";
    const lead = say(hour.lead, claimOn);
    const short = hour.phoneLead ? say(hour.phoneLead, claimOn) : "";
    const onInk = hourTint(at) === "lamp";
    const note = hour.note ? (
        <p className="m-0 max-w-[560px] rounded-mk-card bg-foreground px-5 py-4 text-[15px] leading-normal text-background">
            {hour.note.text}{" "}
            <a
                href={hour.note.link.href}
                className="inline-flex min-h-11 items-center font-semibold text-background underline underline-offset-4"
            >
                {hour.note.link.label} →
            </a>
        </p>
    ) : null;
    const drawn = moments.map((m, i) => <Moment key={i} m={m} />);
    // A phone shows the short lead and the picture; the whole lead, the line
    // after and the note are each in the HTML once, drawn when the scene's
    // toggle opens (`data-pc`, the cut picture's summary or "Read the whole
    // hour"). A desk shows them all.
    const opened = OPENED;
    const folds =
        short !== "" ||
        hour.note !== undefined ||
        (after !== "" && !hour.claimed);
    // A cropped order or Home opens with its own "See the whole …": one link.
    const selfFolds = moments.some(
        (m) => m.kind === "order" || (m.kind === "home" && Boolean(m.more)),
    );
    // Pictures that don't crop themselves are cut on a phone (PHONE.md).
    const clip = moments.some((m) => m.kind === "order" || m.kind === "home")
        ? undefined
        : CLIP[moments[0]?.kind ?? "home"];
    return (
        <DayScene
            at={at}
            id={hour.anchor}
            mood={say(hour.mood, claimOn)}
            title={say(hour.title, claimOn)}
            lead={
                short ? (
                    <>
                        <span
                            className={cn("max-[759px]:hidden", opened.inline)}
                        >
                            {lead}
                        </span>
                        <span className={cn("min-[760px]:hidden", opened.gone)}>
                            {short}
                        </span>
                    </>
                ) : (
                    lead
                )
            }
            used={
                <UsedChips
                    used={hour.used}
                    feature={feature}
                    templatesOn={templatesOn}
                    words={words}
                />
            }
        >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[760px]:gap-8">
                {folds && !clip && !selfFolds ? (
                    <details
                        data-pc="toggle"
                        className="group -mt-4 min-[760px]:hidden"
                    >
                        <summary
                            className={cn(
                                "inline-flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-sm font-semibold underline decoration-1 underline-offset-[3px] [&::-webkit-details-marker]:hidden",
                                onInk
                                    ? "text-mk-lamp-fg decoration-mk-on-ink-line"
                                    : "text-foreground decoration-border-strong",
                                ring(),
                            )}
                        >
                            {words.wholeHour}
                            <ChevronDown
                                aria-hidden
                                className="size-[18px] shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                            />
                        </summary>
                    </details>
                ) : null}
                {clip ? (
                    <PhoneClip
                        height={clip}
                        label={
                            moments
                                .map((m) => ("more" in m ? m.more : undefined))
                                .filter(Boolean)
                                .pop() ?? words.wholePicture
                        }
                        tone={onInk ? "on-ink" : "ink"}
                    >
                        <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
                            {drawn}
                        </div>
                    </PhoneClip>
                ) : (
                    drawn
                )}
                {after ? (
                    <p
                        className={cn(
                            "m-0 max-w-[62ch] text-[15px] leading-relaxed text-mk-copy",
                            // A claim's caveat (9 pm's plans) stays in sight.
                            !hour.claimed && [
                                "max-[759px]:hidden",
                                opened.block,
                            ],
                        )}
                    >
                        {after}
                    </p>
                ) : null}
                {note ? (
                    <div className={cn("max-[759px]:hidden", opened.block)}>
                        {note}
                    </div>
                ) : null}
            </div>
        </DayScene>
    );
}

/* ------------------------------------------------------------------ the page */

/**
 * A trade page in the redesign (boards SOTradeDesk, SLFloristDesk and their
 * Phone2 boards): the trade bar, the hero, what goes wrong, the day hour by
 * hour where one is written, what changes, the template, pricing, questions,
 * the other days and the closing. Every word and picture comes in as props,
 * so saroh.in draws its /for pages and saroh.tech its Solutions with it.
 */
export function TradePageLayout(props: TradePageLayoutProps) {
    const {
        day,
        otherDays,
        feature,
        claimOn,
        templatesOn,
        freeLine,
        words: W,
        cta,
        changes,
        starter,
        pricing,
    } = props;
    const heroCta = "trade-hero-cta";
    const stops = day
        ? (day.business.day ?? []).map((h) => {
              const anchor = h.anchor ?? hourAnchor(h.at);
              const f = h.feature ? feature(h.feature) : undefined;
              return {
                  at: h.at,
                  label: h.label,
                  line: h.line,
                  href: `#${anchor}`,
                  feature: f,
              };
          })
        : [];
    const startHour = day ? anchorAt(day.start.anchor) : "";
    const [startH, startHalf] = startHour
        ? hourLabel(startHour).split(" ")
        : [];

    return (
        <>
            <TradeBar
                slug={props.slug}
                name={props.name}
                day={day}
                bar={props.bar}
                cta={cta}
                hubHref={props.hubHref}
                tradeHref={props.tradeHref}
                words={W}
            />
            {props.draft ? (
                <Container>
                    <p className="m-0 mt-4 w-fit rounded-full bg-[#F6E7CD] px-3 py-1 text-[13px] font-semibold text-[#7A4708]">
                        {W.draft}
                    </p>
                </Container>
            ) : null}

            {/* The hero: the page's own h1 and lead, then the day's picture. */}
            <section className="bg-mk-dawn pb-10 pt-4 min-[760px]:pb-[72px]">
                <SplitHero
                    as="div"
                    crumbs={[
                        { name: W.crumb, href: props.hubHref },
                        { name: props.name },
                    ]}
                    layout="beside"
                    title={props.h1}
                    lede={
                        <>
                            <span className="max-[759px]:hidden">
                                {props.lead}
                                {day ? ` ${day.intro}` : ""}
                            </span>
                            <span className="min-[760px]:hidden">
                                {props.phoneLead ?? props.lead}
                                {day ? ` ${day.phoneIntro}` : ""}
                            </span>
                        </>
                    }
                    ledeClassName="max-w-[620px]"
                    primary={<span id={heroCta}>{cta("hero")}</span>}
                    secondary={
                        day ? (
                            <TextLink
                                href={`#${day.start.anchor}`}
                                tone="ink"
                                className="ml-3"
                            >
                                {day.follow} ↓
                            </TextLink>
                        ) : props.heroLink ? (
                            <TextLink
                                href={props.heroLink.href}
                                tone="ink"
                                arrow
                                className="ml-3"
                            >
                                {props.heroLink.label}
                            </TextLink>
                        ) : null
                    }
                    foot={
                        <>
                            {W.noCard}
                            {freeLine ? <> {freeLine}</> : null}
                        </>
                    }
                    more={
                        day?.exampleNote ? (
                            <p className="m-0 mt-4 max-w-[560px] text-[13px] text-mk-copy">
                                {day.exampleNote}
                            </p>
                        ) : null
                    }
                    gridClassName="gap-10 pt-4 min-[760px]:pt-4 min-[1000px]:grid-cols-[minmax(0,1fr)_400px] min-[1000px]:gap-[72px]"
                    picture={
                        <div className="flex justify-center min-[1000px]:col-start-2 min-[1000px]:row-span-2 min-[1000px]:row-start-1 min-[1000px]:block">
                            {day ? <HomePhone m={day.hero} /> : props.picture}
                        </div>
                    }
                >
                    {day ? (
                        <div
                            id={day.start.anchor}
                            className="grid max-w-[620px] scroll-mt-[calc(var(--mk-nav-h)+80px)] grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 border-t border-border pt-6 min-[1000px]:col-start-1"
                        >
                            <p
                                aria-hidden
                                className="m-0 flex items-start font-display text-[64px] font-bold leading-[0.86] tracking-[-0.05em]"
                            >
                                {startH}
                                <small className="mt-1 text-[18px] font-medium">
                                    {startHalf}
                                </small>
                            </p>
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
                                <p className="m-0 text-[16px] leading-normal text-mk-copy">
                                    <span className="sr-only">
                                        {hourLabel(startHour)}:{" "}
                                    </span>
                                    {day.start.line}
                                </p>
                                {day.start.moments.map((m, i) => (
                                    <Moment key={i} m={m} />
                                ))}
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <UsedChips
                                        used={day.start.used}
                                        feature={feature}
                                        templatesOn={templatesOn}
                                        words={W}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : null}
                </SplitHero>
                {day ? (
                    <Container className="mt-6 min-[760px]:mt-[72px]">
                        {/* A phone: the day's index folds under its title (PHONE.md), once in the HTML. */}
                        <PhoneFold summary={day.stripTitle}>
                            <HourStrip
                                title={day.stripTitle}
                                stops={stops}
                                current={`#${day.start.anchor}`}
                                className="max-[759px]:mt-3 max-[759px]:[&>h2]:sr-only"
                            />
                        </PhoneFold>
                    </Container>
                ) : null}
            </section>

            <Problems
                items={props.problems.items}
                line={props.problems.line}
                day={day}
                feature={feature}
                words={W}
            />

            {day ? (
                <>
                    {day.hours.map((h) => (
                        <Hour
                            key={h.anchor}
                            hour={h}
                            claimOn={claimOn}
                            feature={feature}
                            templatesOn={templatesOn}
                            words={W}
                        />
                    ))}
                    {day.next ? (
                        <section
                            id={day.next.anchor}
                            aria-labelledby={`${day.next.anchor}-title`}
                            className={cn(
                                "scroll-mt-[calc(var(--mk-nav-h)+16px)] bg-mk-dawn",
                                SECTION,
                            )}
                        >
                            <Container className="grid items-center gap-6 min-[760px]:gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_480px] min-[1000px]:gap-20">
                                <div className="grid gap-5">
                                    <SunArc
                                        at={anchorAt(day.next.anchor)}
                                        className="w-11 min-[760px]:w-20"
                                    />
                                    <h2
                                        id={`${day.next.anchor}-title`}
                                        className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance] min-[760px]:text-mk-kit-h1"
                                    >
                                        {day.next.title}
                                    </h2>
                                    <p className="m-0 max-w-[52ch] text-mk-kit-lead text-mk-copy">
                                        {day.next.body}
                                    </p>
                                </div>
                                <PhoneClip height={200} label={W.wholePicture}>
                                    <Moment m={day.next.moment} />
                                </PhoneClip>
                            </Container>
                        </section>
                    ) : null}
                    {changes ? (
                        <section className="border-t border-border py-8 min-[760px]:py-12">
                            <Container>
                                <details className="group rounded-mk-card border border-border bg-card">
                                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 font-display text-mk-kit-h3 font-bold [&::-webkit-details-marker]:hidden">
                                        {changes.folded}
                                        <ChevronDown
                                            aria-hidden
                                            className="size-5 transition-transform group-open:rotate-180"
                                        />
                                    </summary>
                                    <div className="grid gap-6 px-5 pb-8">
                                        <h2 className={`${H2} text-[28px]`}>
                                            {changes.title}
                                        </h2>
                                        {changes.children}
                                    </div>
                                </details>
                            </Container>
                        </section>
                    ) : null}
                </>
            ) : changes ? (
                <section
                    aria-labelledby="changes-title"
                    className={cn("border-t border-border", SECTION)}
                >
                    <Container className="grid grid-cols-[minmax(0,1fr)] gap-10">
                        <h2 id="changes-title" className={H2}>
                            {changes.title}
                        </h2>
                        {changes.children}
                    </Container>
                </section>
            ) : null}

            {/* The template, then what to add first: the starter list. */}
            {starter ? (
                <section aria-labelledby="starter-title" className={SECTION}>
                    <Container className="grid grid-cols-[minmax(0,1fr)] gap-10 min-[1000px]:grid-cols-[420px_minmax(0,1fr)] min-[1000px]:gap-16">
                        <div className="grid content-start gap-4">
                            <h2 id="starter-title" className={H2}>
                                {starter.template
                                    ? starter.template.title
                                    : starter.title}
                            </h2>
                            {starter.template ? (
                                <p className={BODY}>
                                    {starter.template.description}
                                </p>
                            ) : null}
                            {starter.template ? (
                                <div className="mt-2 grid justify-items-start gap-1">
                                    {starter.template.links.map((l) => (
                                        <TextLink
                                            key={l.href}
                                            href={l.href}
                                            tone="ink"
                                            arrow
                                        >
                                            {l.label}
                                        </TextLink>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        <div className="grid content-start gap-4">
                            {starter.template ? (
                                <h3 className="m-0 font-display text-mk-kit-h3 font-bold max-[759px]:hidden">
                                    {starter.title}
                                </h3>
                            ) : null}
                            {/* A phone: under a template, the starter list folds under its title. */}
                            <PhoneFold
                                summary={starter.title}
                                className={cn(
                                    "grid gap-4",
                                    starter.template
                                        ? "-mt-4 min-[760px]:mt-0"
                                        : "[&>details]:hidden [&>div]:!block",
                                )}
                            >
                                <div className="grid gap-4 max-[759px]:pt-2">
                                    <p className={BODY}>{starter.line}</p>
                                    <ul className="m-0 grid list-none gap-0 rounded-mk-card border border-border bg-card p-0">
                                        {starter.rows.map((x) => (
                                            <li
                                                key={x.name}
                                                className="flex justify-between gap-4 border-t border-[#EEEBE4] px-5 py-3.5 text-[15px] first:border-t-0"
                                            >
                                                <b className="font-semibold">
                                                    {x.name}
                                                </b>
                                                <span className="text-mk-copy">
                                                    {x.detail}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </PhoneFold>
                        </div>
                    </Container>
                </section>
            ) : null}

            {pricing ? (
                <section
                    aria-labelledby="pricing-title"
                    className={cn("border-t border-border", SECTION)}
                >
                    <Container className="grid grid-cols-[minmax(0,1fr)] gap-10">
                        <h2 id="pricing-title" className={H2}>
                            {pricing.title}
                        </h2>
                        {pricing.children}
                    </Container>
                </section>
            ) : null}

            <section
                aria-labelledby="faq-title"
                className={cn("border-t border-border", SECTION)}
            >
                <Container className="grid grid-cols-[minmax(0,1fr)] gap-8 min-[1000px]:grid-cols-[400px_minmax(0,1fr)] min-[1000px]:gap-16">
                    <h2 id="faq-title" className={H2}>
                        {props.faq.title}
                    </h2>
                    <div>
                        {/* A phone: three questions, the rest folded (PHONE.md), all in the HTML. */}
                        <FaqItems items={props.faq.items.slice(0, 3)} />
                        {props.faq.items.length > 3 ? (
                            <PhoneFold
                                summary={W.allQuestions}
                                className="max-[759px]:mt-3"
                            >
                                {/* Desk: one list, no second top rule. */}
                                <div className="min-[760px]:[&>div]:border-t-0">
                                    <FaqItems
                                        items={props.faq.items.slice(3)}
                                    />
                                </div>
                            </PhoneFold>
                        ) : null}
                    </div>
                </Container>
            </section>

            <section
                aria-labelledby="others-title"
                className={cn("bg-mk-noon", SECTION)}
            >
                <Container className="grid grid-cols-[minmax(0,1fr)] gap-6 min-[760px]:gap-8">
                    <div className="grid gap-3">
                        <h2 id="others-title" className={H2}>
                            {W.others}
                        </h2>
                        <p className={cn(BODY, "max-w-[520px]")}>
                            {W.othersLine}
                        </p>
                    </div>
                    {otherDays.length > 0 ? (
                        <SwipeRow label={W.others} columns={2}>
                            {otherDays.map((d) => {
                                const first = d.hours[0] as DayHour | undefined;
                                return (
                                    <a
                                        key={d.slug}
                                        href={props.tradeHref(d.slug)}
                                        className="grid h-full content-start gap-2 rounded-[24px] border border-border bg-card p-5 text-foreground no-underline shadow-mk-card hover:border-foreground min-[760px]:gap-3 min-[760px]:p-6"
                                    >
                                        <span className="font-mono text-[14px]">
                                            {first
                                                ? anchorLabel(first.anchor)
                                                : ""}
                                        </span>
                                        <b className="font-display text-[22px] leading-tight tracking-[-0.03em] min-[760px]:text-[26px]">
                                            {first
                                                ? say(first.title, claimOn)
                                                : d.example}
                                        </b>
                                        <span className="text-[14px] text-mk-copy">
                                            {d.example}
                                        </span>
                                        <span className="text-[16px] leading-normal text-mk-copy">
                                            {d.doorLine}
                                        </span>
                                        <span className="mt-2 w-fit border-b-[1.5px] border-current text-[15px] font-semibold">
                                            {W.followDay(d.business.kind)} →
                                        </span>
                                    </a>
                                );
                            })}
                        </SwipeRow>
                    ) : null}
                    <div className="grid gap-3">
                        <h3 className="m-0 text-[15px] font-semibold text-mk-copy">
                            {props.related.title}
                        </h3>
                        <div className="flex flex-wrap gap-2 max-[759px]:-mr-mk-gutter max-[759px]:flex-nowrap max-[759px]:overflow-x-auto max-[759px]:pr-mk-gutter max-[759px]:[scrollbar-width:none] [&>*]:shrink-0">
                            {props.related.items.map((r) =>
                                r.href ? (
                                    <Chip
                                        key={r.slug}
                                        variant="chapter"
                                        href={r.href}
                                    >
                                        {r.name}
                                    </Chip>
                                ) : (
                                    <Chip key={r.slug} variant="chapter">
                                        {r.name}
                                    </Chip>
                                ),
                            )}
                        </div>
                    </div>
                    <Link
                        href={props.hubHref}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[18px] bg-card px-5 py-4 text-foreground no-underline shadow-mk-card hover:ring-1 hover:ring-foreground min-[760px]:px-6 min-[760px]:py-5"
                    >
                        <b className="font-display text-[22px] tracking-[-0.02em]">
                            {props.allTrades.label}
                        </b>
                        <span className="text-[15px] text-mk-copy">
                            {props.allTrades.line} →
                        </span>
                    </Link>
                </Container>
            </section>

            <ClosingCTA
                title={props.closing.title}
                primary={cta("closing")}
                secondary={props.closing.secondary}
                note={props.closing.note}
            />
            <StickyBar watch={heroCta}>{cta("sticky")}</StickyBar>
        </>
    );
}
