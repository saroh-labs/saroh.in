"use client";

import {
    CalendarDays,
    Check,
    CircleAlert,
    Menu,
    Package,
    Plus,
    ShoppingBag,
    User,
} from "lucide-react";
import { useState } from "react";

import type { HomeHeroScene } from "@/content/world";

import { cn } from "@saroh/marketing/cn";
import { Container } from "@saroh/marketing/container";
import { DrawnPhoto } from "@saroh/marketing/kit/drawn-photo";
import { PhoneFrame } from "@saroh/marketing/kit/frames";
import { siteVars } from "@saroh/marketing/kit/site-drawing";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { TradeSwitcher } from "@saroh/marketing/kit/trade-switcher";

const ICON = {
    bag: ShoppingBag,
    alert: CircleAlert,
    box: Package,
    calendar: CalendarDays,
    user: User,
} as const;

const HEAD =
    "font-[family-name:var(--site-font-heading)] [font-weight:var(--site-heading-weight)]";

/** The customer on the business's own site, in its own look. */
function SitePhone({ scene }: { scene: HomeHeroScene }) {
    const { business: b, site } = scene;
    return (
        <div
            style={b.look ? siteVars(b.look) : undefined}
            className="font-[family-name:var(--site-font-body)]"
        >
            <PhoneFrame
                label={`${b.name}'s site on a customer's phone, an example`}
                time={site.time}
                width={300}
                screen="hsl(var(--site-bg))"
            >
                <div className="flex h-full flex-col text-[hsl(var(--site-fg))]">
                    <div className="flex items-center justify-between px-[18px] pb-3 pt-1.5">
                        <span className={cn(HEAD, "text-[21px]")}>
                            {b.name}
                        </span>
                        <Menu aria-hidden className="size-5" />
                    </div>
                    {b.photo ? (
                        <DrawnPhoto
                            kind={b.photo}
                            className="mx-3.5 h-[84px] rounded-[var(--site-radius)]"
                        />
                    ) : (
                        <div
                            aria-hidden
                            className="mx-3.5 h-[84px] rounded-[var(--site-radius)] bg-[hsl(var(--site-accent)/0.35)]"
                        />
                    )}
                    <p
                        className={cn(
                            HEAD,
                            "m-0 px-[18px] pt-3 text-[19px] leading-[1.15]",
                        )}
                    >
                        {site.hero}
                    </p>
                    <ul className="m-0 grid list-none gap-2 px-3.5 pt-2.5">
                        {site.items.map((i) => (
                            <li
                                key={i.name}
                                className="flex items-center gap-2.5 rounded-[var(--site-radius)] bg-[hsl(var(--site-surface))] p-2"
                            >
                                {i.photo ? (
                                    <DrawnPhoto
                                        kind={i.photo}
                                        className="size-10 shrink-0 rounded-[var(--site-radius)]"
                                    />
                                ) : (
                                    <span
                                        aria-hidden
                                        className="size-10 shrink-0 rounded-[var(--site-radius)] bg-[hsl(var(--site-accent)/0.3)]"
                                    />
                                )}
                                <span className="min-w-0 flex-1 text-[13px] leading-snug">
                                    <b
                                        className={cn(
                                            HEAD,
                                            "block text-[14px]",
                                        )}
                                    >
                                        {i.name}
                                    </b>
                                    {i.line}
                                </span>
                                <span
                                    aria-hidden
                                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--site-accent))] text-[hsl(var(--site-accent-fg))]"
                                >
                                    <Plus className="size-4" />
                                </span>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-auto border-t border-[hsl(var(--site-fg)/0.12)] px-3.5 pb-5 pt-2.5">
                        <p className="m-0 mb-2 text-[13px] text-[hsl(var(--site-muted))]">
                            {site.note}
                        </p>
                        <p className="m-0 flex h-11 items-center justify-center rounded-[var(--site-radius)] bg-[hsl(var(--site-fg))] text-[15px] font-bold text-[hsl(var(--site-bg))]">
                            {site.action}
                        </p>
                    </div>
                </div>
            </PhoneFrame>
        </div>
    );
}

/** The owner's morning, on Saroh's own Home. */
function HomePhone({
    scene,
    tabs,
}: {
    scene: HomeHeroScene;
    tabs: readonly string[];
}) {
    const { business: b, home } = scene;
    return (
        <PhoneFrame
            label={`${b.name}'s Home in Saroh at ${home.time}, an example`}
            time={home.time}
            width={300}
            screen="hsl(var(--background))"
        >
            <div className="flex h-full flex-col text-foreground">
                <div className="flex items-center gap-2 px-[18px] pt-1">
                    <span
                        aria-hidden
                        className="flex size-7 items-center justify-center rounded-lg bg-foreground text-[13px] font-bold text-background"
                    >
                        {b.name[0]}
                    </span>
                    <span className="text-[15px] font-semibold">{b.name}</span>
                </div>
                <div className="px-[18px] pt-4">
                    <p className="m-0 font-display text-[23px] font-bold leading-tight tracking-[-0.03em]">
                        {home.greeting}
                    </p>
                    <p className="m-0 mt-1.5 text-[14px] text-muted-foreground">
                        {home.summary}
                    </p>
                </div>
                <ul className="m-0 mx-3 mt-4 list-none rounded-mk-card bg-card p-0 py-1 shadow-[0_1px_2px_rgba(40,30,15,0.08)]">
                    {home.rows.map((r) => {
                        const Icon = ICON[r.icon];
                        return (
                            <li
                                key={r.title}
                                className="flex items-center gap-3 border-t border-mk-line-row px-3.5 py-3 first:border-t-0"
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                                        r.warn
                                            ? "bg-[#FCEBDD] text-[#9A3412]"
                                            : "bg-mk-hover text-mk-copy",
                                    )}
                                >
                                    <Icon className="size-[18px]" />
                                </span>
                                <span className="min-w-0 leading-snug">
                                    <b className="block text-[15px] font-semibold">
                                        {r.title}
                                    </b>
                                    <span className="text-[13px] text-muted-foreground">
                                        {r.line}
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
                {home.paid ? (
                    <p className="m-0 mx-3 mt-3 flex items-center gap-3 rounded-mk-card bg-mk-ok-tint px-3.5 py-3 text-[13px] leading-snug text-mk-ok">
                        <Check aria-hidden className="size-[18px] shrink-0" />
                        <span>
                            <b className="block text-[15px] tabular-nums">
                                {home.paid.title}
                            </b>
                            {home.paid.line}
                        </span>
                    </p>
                ) : null}
                <ul
                    aria-hidden
                    className="m-0 mt-auto flex h-16 list-none items-center justify-around border-t border-border bg-mk-noon p-0 text-[12px] text-muted-foreground"
                >
                    {tabs.map((t, i) => (
                        <li
                            key={t}
                            className={cn(
                                i === 0 && "font-semibold text-foreground",
                            )}
                        >
                            {t}
                        </li>
                    ))}
                </ul>
            </div>
        </PhoneFrame>
    );
}

/** The customer's done screen, back on the business's site. */
function DonePhone({ scene }: { scene: HomeHeroScene }) {
    const { business: b, done } = scene;
    return (
        <div
            style={b.look ? siteVars(b.look) : undefined}
            className="font-[family-name:var(--site-font-body)]"
        >
            <PhoneFrame
                label={`${done.title}: the customer's screen at ${b.name}, an example`}
                time={done.time}
                width={300}
                screen="hsl(var(--site-bg))"
            >
                <div className="flex h-full flex-col text-[hsl(var(--site-fg))]">
                    <p className="m-0 px-[18px] pt-1.5 text-[14px] text-[hsl(var(--site-muted))]">
                        {b.name}
                    </p>
                    <div className="flex flex-1 flex-col items-center px-5 pt-5 text-center">
                        <span
                            aria-hidden
                            className="flex size-16 items-center justify-center rounded-full bg-[hsl(var(--site-accent))] text-[hsl(var(--site-accent-fg))]"
                        >
                            <Check className="size-8" />
                        </span>
                        <p
                            className={cn(
                                HEAD,
                                "m-0 mt-4 text-[32px] leading-none",
                            )}
                        >
                            {done.title}
                        </p>
                        <p className="m-0 mt-2 text-[15px] text-[hsl(var(--site-muted))]">
                            {done.line}
                        </p>
                        <dl className="m-0 mt-5 w-full rounded-[var(--site-radius)] bg-[hsl(var(--site-surface))] text-left text-[14px]">
                            {done.rows.map(([k, v]) => (
                                <div
                                    key={k}
                                    className="flex justify-between gap-3 border-t border-[hsl(var(--site-fg)/0.1)] px-3.5 py-3 first:border-t-0"
                                >
                                    <dt>{k}</dt>
                                    <dd className="m-0 font-bold">{v}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <p className="m-0 mx-3.5 mb-5 mt-3 flex h-11 items-center justify-center rounded-[var(--site-radius)] border-[1.5px] border-[hsl(var(--site-fg))] text-[15px] font-bold">
                        {done.back}
                    </p>
                </div>
            </PhoneFrame>
        </div>
    );
}

const PHONE =
    "mx-auto w-[300px] max-w-full max-[759px]:h-[360px] max-[759px]:overflow-hidden";

/**
 * The landing hero's switcher and its three phones (LAHomeDesk): the
 * customer orders on the left, the owner's morning in the middle, the
 * customer's done screen on the right. "Show it for a" swaps all three to
 * that trade's example (a 240ms fade). On a phone they are a swipe row,
 * the owner's morning first, each cropped to its top 360px. Every scene is
 * the edition's world's; this file holds no business.
 */
export function HeroStage({
    scenes,
    legend,
    label,
    tabs,
}: {
    scenes: readonly HomeHeroScene[];
    legend: string;
    /** Names the row of phones for a screen reader. */
    label: string;
    tabs: readonly string[];
}) {
    const [trade, setTrade] = useState(scenes[0].trade);
    const scene = scenes.find((s) => s.trade === trade) ?? scenes[0];
    const fade =
        "animate-in fade-in duration-[240ms] ease-out motion-reduce:animate-none";
    return (
        <>
            <Container className="mt-6 flex justify-start min-[760px]:justify-center">
                <TradeSwitcher
                    legend={legend}
                    value={scene.trade}
                    onSelect={(id) => setTrade(id as typeof trade)}
                    options={scenes.map((s) => ({
                        id: s.trade,
                        label: s.trade[0].toUpperCase() + s.trade.slice(1),
                    }))}
                />
            </Container>
            <div className="relative mt-6 min-[760px]:mt-8">
                <div
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 top-[110px] bg-mk-hover min-[760px]:top-[220px]"
                />
                <Container className="relative pb-5 min-[760px]:pb-6">
                    <SwipeRow
                        label={label}
                        className={cn(
                            "min-[760px]:[&>ul]:flex min-[760px]:[&>ul]:items-start min-[760px]:[&>ul]:justify-center min-[760px]:[&>ul]:gap-7",
                            // Desk: the owner's morning in the middle, raised.
                            "min-[760px]:[&>ul>li:nth-child(1)]:z-10 min-[760px]:[&>ul>li:nth-child(1)]:order-2 min-[760px]:[&>ul>li:nth-child(1)]:w-[min(300px,30vw)]",
                            "min-[760px]:[&>ul>li:nth-child(2)]:order-1 min-[760px]:[&>ul>li:nth-child(3)]:order-3",
                            "min-[760px]:[&>ul>li:not(:first-child)]:mt-14 min-[760px]:[&>ul>li:not(:first-child)]:w-[min(272px,27vw)]",
                            "[&>p]:text-center",
                        )}
                    >
                        <div
                            key={`h-${scene.trade}`}
                            className={cn(PHONE, fade)}
                        >
                            <HomePhone scene={scene} tabs={tabs} />
                        </div>
                        <div
                            key={`s-${scene.trade}`}
                            className={cn(PHONE, fade)}
                        >
                            <SitePhone scene={scene} />
                        </div>
                        <div
                            key={`d-${scene.trade}`}
                            className={cn(PHONE, fade)}
                        >
                            <DonePhone scene={scene} />
                        </div>
                    </SwipeRow>
                    <p className="m-0 mt-3 text-center text-[14px] text-mk-copy">
                        {scene.caption}
                    </p>
                </Container>
            </div>
        </>
    );
}
