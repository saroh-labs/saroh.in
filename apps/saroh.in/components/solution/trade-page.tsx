import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";
import { ButtonLink } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import { Container } from "@saroh/marketing/container";
import { FaqItems } from "@saroh/marketing/faq";
import type { ClaimSwitch } from "@saroh/marketing/feature-switches";
import { Chip } from "@saroh/marketing/kit/chip";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { DayScene } from "@saroh/marketing/kit/day-scene";
import { PhoneFrame } from "@saroh/marketing/kit/frames";
import { HourStrip } from "@saroh/marketing/kit/hour-strip";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { SunArc } from "@saroh/marketing/kit/sun-arc";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { hourAnchor, hourLabel } from "@saroh/marketing/kit/time";
import { TradeSwitcher } from "@saroh/marketing/kit/trade-switcher";
import { TextLink } from "@saroh/marketing/text-link";
import type { NewFeature, SearchPageData } from "@saroh/search-pages";
import {
    AiAsks,
    AlsoSvg,
    bigTile,
    FrameDesk,
    FramePhone,
    newAlso,
    PRESETS,
    smallKeys,
    SmallPicture,
    starterWords,
} from "@saroh/search-pages";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import type { DayHour, TradeDay, UsedLink } from "@/content/solutions-days";
import { TRADE_WORDS as W } from "@/content/solutions-trade";

import { HomePhone, Moment, MomentIconMark } from "./moments/moments";
import type { MomentIcon } from "./moments/types";
import { say } from "./words";

/** A feature's chip: its name and page, or nothing while it is switched off. */
export interface FeatureLink {
    label: string;
    href: string;
}

export interface TradePageProps {
    page: SearchPageData;
    draft?: boolean;
    /** The written day, where there is one. */
    day?: TradeDay;
    /** The other written days, for "Same day, other trades". */
    otherDays: readonly TradeDay[];
    /** The `src` of this page's start buttons ("for-home-bakers"). */
    src: string;
    demo?: string;
    /** A related trade's page, when this build has it. */
    pageHref: (slug: string) => string | undefined;
    /** A feature's chip, or undefined while its page is off. */
    feature: (slug: string) => FeatureLink | undefined;
    /** The release switches that are off (U13): the AI section and new Also items follow them. */
    off: readonly string[];
    claimOn: (claim: ClaimSwitch) => boolean;
    freeLine?: ReactNode;
    pricing?: ReactNode;
    /** The trade's gallery template, while Templates is on. */
    template?: {
        slug: string;
        name: string;
        href: string;
        description: string;
    };
    /** How many trades the hub lists. */
    tradeCount: number;
    /** The trade bar's trades: the written days' and the lead ones. */
    bar: readonly { slug: string; label: string }[];
}

const SECTION = "py-[72px] min-[760px]:py-[120px]";
const H2 = "m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]";
const BODY = "m-0 text-[16px] leading-relaxed text-mk-copy";

/** Desk and phone words: one element when they're the same, two when not. */
function Both({ desk, phone }: { desk: string; phone?: string }) {
    if (!phone || phone === desk) return <>{desk}</>;
    return (
        <>
            <span className="max-[759px]:hidden">{desk}</span>
            <span className="min-[760px]:hidden">{phone}</span>
        </>
    );
}

function UsedChips({
    used,
    feature,
    templatesOn,
}: {
    used: readonly UsedLink[];
    feature: TradePageProps["feature"];
    templatesOn: boolean;
}) {
    const chips = used.flatMap((u) => {
        if ("feature" in u) {
            const f = feature(u.feature);
            return f ? [{ label: f.label, href: f.href, tail: W.how }] : [];
        }
        if (u.needs === "templates" && !templatesOn) return [];
        return [{ label: u.label, href: u.href, tail: "see it" }];
    });
    if (chips.length === 0) return null;
    return (
        <>
            <span className="text-[14px] text-mk-copy">{W.used}</span>
            {chips.map((c) => (
                // Own ink, so a chip on the night band keeps its words dark on white.
                <Chip
                    key={c.href}
                    variant="chapter"
                    href={c.href}
                    className="text-[hsl(var(--foreground))]"
                >
                    {c.label}
                    <span className="font-normal text-[hsl(var(--mk-body))]">
                        &nbsp;· {c.tail}
                    </span>
                </Chip>
            ))}
        </>
    );
}

/* ------------------------------------------------------------------ hero */

const CHIP_ICON: Record<string, MomentIcon> = {
    cal: "calendar",
    ok: "check",
    bill: "bill",
    person: "customer",
};

/** A trade without a written day: its sample day on a phone, from its MDX scene. */
function SceneHero({ page }: { page: SearchPageData }) {
    const s = page.scene;
    return (
        <PhoneFrame label={s.heroAlt} width={360}>
            <div className="grid gap-1 px-5 pb-5 pt-2">
                <p className="m-0 flex items-baseline justify-between">
                    <b className="font-display text-[20px] tracking-[-0.02em]">
                        {s.hero.title}
                    </b>
                    <span className="text-[13px] text-mk-copy">
                        {s.hero.count}
                    </span>
                </p>
                <p className="m-0 text-[13px] text-mk-copy">{s.business}</p>
                <ul className="m-0 mt-3 list-none p-0">
                    {s.hero.rows.map((r, i) => (
                        <li
                            key={r.time + r.name}
                            className={cn(
                                "flex gap-3 border-b border-[#EEEBE4] px-2 py-2.5 text-[14px]",
                                i === s.hero.highlight &&
                                    "rounded-[8px] bg-[#FFF9EE]",
                            )}
                        >
                            <span className="w-14 shrink-0 font-mono text-[13px]">
                                {r.time}
                            </span>
                            <b className="min-w-0 flex-1 font-semibold">
                                {r.name}
                            </b>
                            <span className="text-mk-copy">{r.right}</span>
                        </li>
                    ))}
                </ul>
                <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                    {s.chips.map((c) => (
                        <li
                            key={c.title}
                            className="flex items-center gap-3 rounded-mk-crop bg-background p-3"
                        >
                            <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[#F1EBDF]">
                                <MomentIconMark
                                    icon={CHIP_ICON[c.icon] ?? "check"}
                                    className="size-4"
                                />
                            </span>
                            <span className="grid min-w-0 gap-0.5">
                                <b className="text-[14px] font-semibold">
                                    {c.title}
                                </b>
                                {c.sub ? (
                                    <span className="text-[13px] text-mk-copy">
                                        <Both desk={c.sub} phone={c.phoneSub} />
                                    </span>
                                ) : null}
                            </span>
                            {c.pill ? (
                                <span className="ml-auto shrink-0 rounded-full bg-mk-ok-tint px-2.5 py-1 text-[12px] font-semibold text-mk-ok">
                                    {c.pill}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ul>
                {s.proof ? (
                    <p className="m-0 mt-2 flex items-center gap-3 rounded-mk-crop border border-border p-3">
                        <span className="grid min-w-0 gap-0.5">
                            <b className="text-[14px] font-semibold">
                                {s.proof.title}
                            </b>
                            <span className="text-[13px] text-mk-copy">
                                {s.proof.sub}
                            </span>
                        </span>
                        {s.proof.pill ? (
                            <span className="ml-auto shrink-0 rounded-full bg-mk-ok-tint px-2.5 py-1 text-[12px] font-semibold text-mk-ok">
                                {s.proof.pill}
                            </span>
                        ) : null}
                    </p>
                ) : null}
            </div>
        </PhoneFrame>
    );
}

function TradeBar({
    page,
    day,
    bar,
    src,
}: Pick<TradePageProps, "page" | "day" | "bar" | "src">) {
    const options = [
        ...(bar.some((b) => b.slug === page.slug)
            ? []
            : [{ id: page.slug, label: page.name }]),
        ...bar.map((b) => ({
            id: b.slug,
            label: b.label,
            href: `/for/${b.slug}`,
        })),
        { id: "all", label: W.allTradesShort, href: "/for" },
    ];
    return (
        <div className="sticky top-[var(--mk-nav-h)] z-30 border-y border-border bg-background/95 backdrop-blur-[6px]">
            <Container className="flex h-[60px] items-center gap-4 min-[760px]:h-[68px]">
                <TradeSwitcher
                    legend={W.tradeBar}
                    value={page.slug}
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
                    <CtaLink src={`${src}-bar`} size="kit" />
                </span>
            </Container>
        </div>
    );
}

/* ------------------------------------------------------------------ problems */

function Problems({
    page,
    day,
    feature,
}: Pick<TradePageProps, "page" | "day" | "feature">) {
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
                        {day?.problemsLine ?? W.problemsLine}
                    </p>
                </div>
                <SwipeRow label={W.problems} columns={1}>
                    {page.problems.map((x) => {
                        const slug = problemFeature(x.link);
                        const f = slug ? feature(slug) : undefined;
                        const hour = hourOf(slug);
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
                                    <details className="group">
                                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14px] font-medium text-mk-copy [&::-webkit-details-marker]:hidden">
                                            {W.problemHow}
                                            <ChevronDown
                                                aria-hidden
                                                className="size-5 transition-transform group-open:rotate-180"
                                            />
                                        </summary>
                                        <div className="grid gap-1.5 pb-2">
                                            {x.title ? (
                                                <h3 className="m-0 text-[16px] font-semibold">
                                                    {x.title}
                                                </h3>
                                            ) : null}
                                            {x.body ? (
                                                <p className={BODY}>{x.body}</p>
                                            ) : null}
                                            {f ? (
                                                <TextLink
                                                    href={f.href}
                                                    tone="ink"
                                                    arrow
                                                >
                                                    {x.link ?? f.label}
                                                </TextLink>
                                            ) : null}
                                        </div>
                                    </details>
                                ) : null}
                            </article>
                        );
                    })}
                </SwipeRow>
            </Container>
        </section>
    );
}

/** A problem's `link` word ("Orders", "Website") as a feature's slug. */
const PROBLEM_LINKS: Readonly<Record<string, string>> = {
    website: "website",
    orders: "orders",
    products: "products",
    customers: "customers",
    billing: "billing",
    bookings: "bookings",
    subscriptions: "subscriptions",
    insights: "insights",
    dashboard: "dashboard",
    "ask ai": "ask-ai",
    "ai apps": "ai-apps",
    share: "social",
};
function problemFeature(link?: string): string | undefined {
    return link ? PROBLEM_LINKS[link.toLowerCase()] : undefined;
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

function Hour({
    hour,
    claimOn,
    feature,
    templatesOn,
}: {
    hour: DayHour;
    claimOn: TradePageProps["claimOn"];
    feature: TradePageProps["feature"];
    templatesOn: boolean;
}) {
    const at = anchorAt(hour.anchor);
    const moments = hour.claimed
        ? claimOn(hour.claimed.claim)
            ? hour.claimed.on
            : hour.claimed.off
        : hour.moments;
    const after = hour.after ? say(hour.after, claimOn) : "";
    return (
        <DayScene
            at={at}
            id={hour.anchor}
            mood={say(hour.mood, claimOn)}
            title={say(hour.title, claimOn)}
            lead={say(hour.lead, claimOn)}
            used={
                <UsedChips
                    used={hour.used}
                    feature={feature}
                    templatesOn={templatesOn}
                />
            }
        >
            <div className="grid gap-8">
                {moments.map((m, i) => (
                    <Moment key={i} m={m} />
                ))}
                {after ? (
                    <p className="m-0 max-w-[62ch] text-[15px] leading-relaxed text-mk-copy">
                        {after}
                    </p>
                ) : null}
                {hour.note ? (
                    <p className="m-0 max-w-[560px] rounded-mk-card bg-foreground px-5 py-4 text-[15px] leading-normal text-background">
                        {hour.note.text}{" "}
                        <a
                            href={hour.note.link.href}
                            className="inline-flex min-h-11 items-center font-semibold text-background underline underline-offset-4"
                        >
                            {hour.note.link.label} →
                        </a>
                    </p>
                ) : null}
            </div>
        </DayScene>
    );
}

/* ------------------------------------------------------------------ what changes */

function Changes({
    page: p,
    isOn,
    feature,
}: {
    page: SearchPageData;
    isOn: (f: NewFeature) => boolean;
    feature: TradePageProps["feature"];
}) {
    const s = p.scene;
    const T = s.tiles;
    const pre = PRESETS[p.shape];
    const big = bigTile(p);
    const bigWords = T[pre.big] as (typeof T)[string] | undefined;
    const url = p.shape === "orders" ? "app.saroh.in" : s.site;
    const extra = newAlso(p, isOn);
    return (
        // The tiles' drawings are the search pages' own (`.sp` carries their colours).
        <div className="sp grid gap-12">
            <div className="grid gap-5 min-[760px]:grid-cols-2 min-[1000px]:grid-cols-3">
                {bigWords ? (
                    <article className="grid content-start gap-4 rounded-mk-card border border-border bg-card p-5 min-[760px]:col-span-2 min-[1000px]:col-span-3">
                        <div className="max-[759px]:hidden">
                            <FrameDesk url={url}>{big.desk}</FrameDesk>
                        </div>
                        <div className="min-[760px]:hidden">
                            <FramePhone url={url}>{big.phone}</FramePhone>
                        </div>
                        <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                            {bigWords.title}
                        </h3>
                        <p className={BODY}>
                            <Both
                                desk={bigWords.line}
                                phone={bigWords.phoneLine}
                            />
                        </p>
                    </article>
                ) : null}
            </div>
            <SwipeRow
                label={p.problemsTitle}
                columns={smallKeys(p).length % 3 === 1 ? 2 : 3}
            >
                {smallKeys(p).map((k) => {
                    const w = T[k] as (typeof T)[string] | undefined;
                    return (
                        <article
                            key={k}
                            className="grid h-full content-start gap-4 rounded-mk-card border border-border bg-card p-5"
                        >
                            <div className="vc-pic" aria-hidden="true">
                                <SmallPicture k={k} p={p} />
                            </div>
                            <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                {w?.title}
                            </h3>
                            <p className={BODY}>
                                <Both
                                    desk={w?.line ?? ""}
                                    phone={w?.phoneLine}
                                />
                            </p>
                        </article>
                    );
                })}
            </SwipeRow>
            <figure className="m-0 grid gap-4 rounded-mk-card bg-foreground p-6 text-background min-[760px]:grid-cols-[minmax(0,1fr)_260px] min-[760px]:p-10">
                <blockquote className="m-0">
                    <p className="m-0 font-display text-[24px] font-bold leading-tight tracking-[-0.025em] min-[760px]:text-[36px]">
                        “{s.quote.text}”
                    </p>
                </blockquote>
                <figcaption className="text-[15px] leading-relaxed text-mk-on-ink">
                    {s.quote.caption}
                </figcaption>
            </figure>
            <div className="grid gap-5">
                <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                    {W.also}
                </h3>
                <ul className="m-0 grid list-none gap-x-10 gap-y-5 p-0 min-[760px]:grid-cols-2 min-[1000px]:grid-cols-3">
                    {s.also.map((it, i) => (
                        <li key={it.title} className="flex gap-3">
                            <span className="va-icon">
                                <AlsoSvg
                                    icon={
                                        it.icon ??
                                        (pre.also[i] as
                                            | (typeof pre.also)[number]
                                            | undefined) ??
                                        "list"
                                    }
                                />
                            </span>
                            <span className="grid gap-1">
                                <b className="text-[16px] font-semibold">
                                    {it.title}
                                </b>
                                <span className="text-[15px] leading-snug text-mk-copy">
                                    {it.line}
                                </span>
                            </span>
                        </li>
                    ))}
                    {extra.map((it) => {
                        const f = feature(it.feature);
                        return (
                            <li key={it.feature} className="flex gap-3">
                                <span className="va-icon">
                                    <AlsoSvg icon={it.icon} />
                                </span>
                                <span className="grid gap-1">
                                    {f ? (
                                        <TextLink
                                            href={f.href}
                                            tone="ink"
                                            arrow
                                        >
                                            {it.title}
                                        </TextLink>
                                    ) : (
                                        <b className="text-[16px] font-semibold">
                                            {it.title}
                                        </b>
                                    )}
                                    <span className="text-[15px] leading-snug text-mk-copy">
                                        {it.line}
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
            {p.ai && isOn("ai-apps") ? (
                <AiAsks
                    ai={p.ai}
                    isOn={isOn}
                    feature={(f) => feature(f)?.href}
                />
            ) : null}
        </div>
    );
}

/* ------------------------------------------------------------------ the page */

export function TradePage(props: TradePageProps) {
    const {
        page: p,
        draft = false,
        day,
        otherDays,
        src,
        demo,
        pageHref,
        feature,
        off,
        claimOn,
        freeLine,
        pricing,
        template,
        tradeCount,
    } = props;
    const isOn = (f: NewFeature) => !off.includes(f);
    const templatesOn = !off.includes("templates");
    const starter = starterWords(p);
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

    const changes = <Changes page={p} isOn={isOn} feature={feature} />;

    return (
        <>
            <TradeBar page={p} day={day} bar={props.bar} src={src} />
            {draft ? (
                <Container>
                    <p className="m-0 mt-4 w-fit rounded-full bg-[#F6E7CD] px-3 py-1 text-[13px] font-semibold text-[#7A4708]">
                        {W.draft}
                    </p>
                </Container>
            ) : null}

            {/* The hero: the page's own h1 and lead, then the day's picture. */}
            <section className="bg-mk-dawn pb-16 pt-4 min-[760px]:pb-[72px]">
                <Container className="grid grid-cols-[minmax(0,1fr)] gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_400px] min-[1000px]:gap-[72px]">
                    <div className="grid min-w-0 content-start">
                        <Breadcrumbs
                            crumbs={[
                                { name: W.crumb, href: "/for" },
                                { name: p.name },
                            ]}
                        />
                        <h1 className="m-0 mt-4 max-w-[16ch] font-display text-mk-kit-h1 font-bold [text-wrap:balance]">
                            {p.h1}
                        </h1>
                        <p className="m-0 mt-6 max-w-[620px] text-mk-kit-lead text-mk-copy">
                            <span className="max-[759px]:hidden">
                                {p.lead}
                                {day ? ` ${day.intro}` : ""}
                            </span>
                            <span className="min-[760px]:hidden">
                                {p.phoneLead ?? p.lead}
                                {day ? ` ${day.phoneIntro}` : ""}
                            </span>
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                            <span id={heroCta}>
                                <CtaLink
                                    src={src}
                                    size="kit"
                                    template={
                                        template
                                            ? {
                                                  slug: template.slug,
                                                  name: template.name,
                                              }
                                            : undefined
                                    }
                                />
                            </span>
                            {day ? (
                                <TextLink
                                    href={`#${day.start.anchor}`}
                                    tone="ink"
                                >
                                    {day.follow} ↓
                                </TextLink>
                            ) : p.demo && demo ? (
                                <TextLink href={demo} tone="ink" arrow>
                                    {p.demo}
                                </TextLink>
                            ) : null}
                        </div>
                        <p className="m-0 mt-3 text-[15px] text-muted-foreground">
                            {W.noCard}
                            {freeLine ? <> {freeLine}</> : null}
                        </p>
                        {day?.exampleNote ? (
                            <p className="m-0 mt-4 max-w-[560px] text-[13px] text-mk-copy">
                                {day.exampleNote}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex justify-center min-[1000px]:col-start-2 min-[1000px]:row-span-2 min-[1000px]:row-start-1 min-[1000px]:block">
                        {day ? (
                            <HomePhone m={day.hero} />
                        ) : (
                            <SceneHero page={p} />
                        )}
                    </div>
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
                            <div className="grid content-start gap-3">
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
                                    />
                                </div>
                            </div>
                        </div>
                    ) : null}
                </Container>
                {day ? (
                    <Container className="mt-14 min-[760px]:mt-[72px]">
                        <HourStrip
                            title={day.stripTitle}
                            stops={stops}
                            current={`#${day.start.anchor}`}
                        />
                    </Container>
                ) : null}
            </section>

            <Problems page={p} day={day} feature={feature} />

            {day ? (
                <>
                    {day.hours.map((h) => (
                        <Hour
                            key={h.anchor}
                            hour={h}
                            claimOn={claimOn}
                            feature={feature}
                            templatesOn={templatesOn}
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
                            <Container className="grid items-center gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_480px] min-[1000px]:gap-20">
                                <div className="grid gap-5">
                                    <SunArc
                                        at={anchorAt(day.next.anchor)}
                                        className="w-20"
                                    />
                                    <h2
                                        id={`${day.next.anchor}-title`}
                                        className="m-0 font-display text-mk-kit-h1 font-bold [text-wrap:balance]"
                                    >
                                        {day.next.title}
                                    </h2>
                                    <p className="m-0 max-w-[52ch] text-mk-kit-lead text-mk-copy">
                                        {day.next.body}
                                    </p>
                                </div>
                                <Moment m={day.next.moment} />
                            </Container>
                        </section>
                    ) : null}
                    <section className={cn("border-t border-border", "py-12")}>
                        <Container>
                            <details className="group rounded-mk-card border border-border bg-card">
                                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 font-display text-mk-kit-h3 font-bold [&::-webkit-details-marker]:hidden">
                                    {W.moreTitle(p.plural)}
                                    <ChevronDown
                                        aria-hidden
                                        className="size-5 transition-transform group-open:rotate-180"
                                    />
                                </summary>
                                <div className="grid gap-6 px-5 pb-8">
                                    <h2 className={cn(H2, "text-[28px]")}>
                                        {p.problemsTitle}
                                    </h2>
                                    {/* The page's own sample day, kept with its words. */}
                                    <div className="flex justify-center">
                                        <SceneHero page={p} />
                                    </div>
                                    {changes}
                                </div>
                            </details>
                        </Container>
                    </section>
                </>
            ) : (
                <section
                    aria-labelledby="changes-title"
                    className={cn("border-t border-border", SECTION)}
                >
                    <Container className="grid grid-cols-[minmax(0,1fr)] gap-10">
                        <h2 id="changes-title" className={H2}>
                            {p.problemsTitle}
                        </h2>
                        {changes}
                    </Container>
                </section>
            )}

            {/* The template, then what to add first: the starter list. */}
            <section aria-labelledby="starter-title" className={SECTION}>
                <Container className="grid grid-cols-[minmax(0,1fr)] gap-10 min-[1000px]:grid-cols-[420px_minmax(0,1fr)] min-[1000px]:gap-16">
                    <div className="grid content-start gap-4">
                        <h2 id="starter-title" className={H2}>
                            {template
                                ? W.template(template.name)
                                : starter.title}
                        </h2>
                        {template ? (
                            <p className={BODY}>{template.description}</p>
                        ) : null}
                        {template ? (
                            <div className="mt-2 grid justify-items-start gap-1">
                                <TextLink href={template.href} tone="ink" arrow>
                                    {W.seeTemplate(template.name)}
                                </TextLink>
                                <TextLink href="/templates" tone="ink" arrow>
                                    {W.allTemplates}
                                </TextLink>
                            </div>
                        ) : null}
                    </div>
                    <div className="grid content-start gap-4">
                        {template ? (
                            <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                {starter.title}
                            </h3>
                        ) : null}
                        <p className={BODY}>{starter.line}</p>
                        <ul className="m-0 grid list-none gap-0 rounded-mk-card border border-border bg-card p-0">
                            {p.services.map((x) => (
                                <li
                                    key={x.name}
                                    className="flex justify-between gap-4 border-t border-[#EEEBE4] px-5 py-3.5 text-[15px] first:border-t-0"
                                >
                                    <b className="font-semibold">{x.name}</b>
                                    <span className="text-mk-copy">
                                        {x.detail}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Container>
            </section>

            {pricing ? (
                <section
                    aria-labelledby="pricing-title"
                    className={cn("border-t border-border", SECTION)}
                >
                    <Container className="grid grid-cols-[minmax(0,1fr)] gap-10">
                        <h2 id="pricing-title" className={H2}>
                            {W.pricing(p.plural)}
                        </h2>
                        {pricing}
                    </Container>
                </section>
            ) : null}

            <section
                aria-labelledby="faq-title"
                className={cn("border-t border-border", SECTION)}
            >
                <Container className="grid grid-cols-[minmax(0,1fr)] gap-8 min-[1000px]:grid-cols-[400px_minmax(0,1fr)] min-[1000px]:gap-16">
                    <h2 id="faq-title" className={H2}>
                        {W.questions(p.plural)}
                    </h2>
                    <div>
                        <FaqItems
                            items={p.questions.map((q) => ({
                                q: q.question,
                                a: q.answer.join(" "),
                            }))}
                        />
                    </div>
                </Container>
            </section>

            <section
                aria-labelledby="others-title"
                className={cn("bg-mk-noon", SECTION)}
            >
                <Container className="grid grid-cols-[minmax(0,1fr)] gap-8">
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
                                        href={`/for/${d.slug}`}
                                        className="grid h-full content-start gap-3 rounded-[24px] border border-border bg-card p-6 text-foreground no-underline shadow-mk-card hover:border-foreground"
                                    >
                                        <span className="font-mono text-[14px]">
                                            {first
                                                ? anchorLabel(first.anchor)
                                                : ""}
                                        </span>
                                        <b className="font-display text-[26px] leading-tight tracking-[-0.03em]">
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
                            {W.related(p.plural)}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {p.related.map((r) => {
                                const href = pageHref(r.slug);
                                return href ? (
                                    <Chip
                                        key={r.slug}
                                        variant="chapter"
                                        href={href}
                                    >
                                        {r.name}
                                    </Chip>
                                ) : (
                                    <Chip key={r.slug} variant="chapter">
                                        {r.name}
                                    </Chip>
                                );
                            })}
                        </div>
                    </div>
                    <Link
                        href="/for"
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-card px-6 py-5 text-foreground no-underline shadow-mk-card hover:ring-1 hover:ring-foreground"
                    >
                        <b className="font-display text-[22px] tracking-[-0.02em]">
                            {W.allTrades(tradeCount)}
                        </b>
                        <span className="text-[15px] text-mk-copy">
                            {W.allTradesLine} →
                        </span>
                    </Link>
                </Container>
            </section>

            <ClosingCTA
                title={p.ctaTitle}
                primary={
                    <CtaLink
                        src={`${src}-closing`}
                        size="kit"
                        template={
                            template
                                ? { slug: template.slug, name: template.name }
                                : undefined
                        }
                    />
                }
                secondary={
                    <ButtonLink
                        href={template ? template.href : "/features"}
                        variant="secondary"
                        size="kit"
                    >
                        {template ? W.seeTemplate(template.name) : W.howItWorks}
                    </ButtonLink>
                }
                note={`${PRESETS[p.shape].close} ${W.noCard}`}
            />
            <StickyBar watch={heroCta}>
                <CtaLink src={`${src}-sticky`} size="kit" className="w-full" />
            </StickyBar>
        </>
    );
}
