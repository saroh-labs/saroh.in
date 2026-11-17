"use client";

import {
    setAddressParams,
    subscribeAddress,
} from "@saroh/search-pages/address-filters";
import { ChevronDown, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { cn } from "../cn";
import { fieldClasses } from "../fields/field-classes";
import { Chip } from "../kit/chip";
import { SunArc } from "../kit/sun-arc";
import { SwipeRow } from "../kit/swipe-row";
import { clockLabel, hourTint } from "../kit/time";
import { ring } from "../ring";
import { TONE_BAND } from "../sections/section";

/** The small drawn detail on a trade's tile. */
export type HubDetail =
    | { kind: "pill"; text: string; tone?: "warn" | "paid" }
    | { kind: "bar"; label: string; n: number; of: number }
    | { kind: "slots"; label: string; taken: number; of: number }
    | { kind: "bill"; label: string; amount: string };

/** How a trade's customers come to it: the search pages' shapes. */
export type HubWay = "appointments" | "classes" | "orders";

export interface HubTile {
    slug: string;
    name: string;
    href: string;
    at: string;
    line: string;
    detail?: HubDetail;
    /** A whole day is written for it. */
    flagship: boolean;
    way: HubWay;
    /** Lower-case: its name, family, search phrase, promise and the owner's other words. */
    words: string;
}

export interface HubGroupView {
    id: string;
    title: string;
    how: string;
    tiles: HubTile[];
}

export interface HubFinderWords {
    searchLabel: string;
    searchPlaceholder: string;
    what: string;
    all: string;
    howShort: string;
    ways: Record<HubWay, string>;
    reset: string;
    flagship: string;
    az: string;
    azLine: string;
    count: { all: string; some: string };
    trades: string;
    /** For a group of one, when it reads differently: "{n} trade". */
    trade?: string;
    none: string;
}

interface Filters {
    family: string | null;
    way: HubWay | null;
    query: string;
}

const WAYS: HubWay[] = ["appointments", "classes", "orders"];

/** The filters live in the address, so a link keeps them and Back undoes them. */
function setAddress(next: Filters, how: "pushState" | "replaceState") {
    setAddressParams(
        { family: next.family, how: next.way, q: next.query },
        how,
    );
}

function readFilters(search: string, groups: HubGroupView[]): Filters {
    const params = new URLSearchParams(search);
    const family = params.get("family");
    const way = WAYS.find((w) => w === params.get("how")) ?? null;
    return {
        family: groups.some((g) => g.id === family) ? family : null,
        way,
        query: params.get("q") ?? "",
    };
}

/** Every word of the search is somewhere in the trade's words. */
const matches = (t: HubTile, query: string) =>
    query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => t.words.includes(word));

const fill = (s: string, n: Record<string, number | string>) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => String(n[k] ?? ""));

function Detail({ d }: { d: HubDetail }) {
    switch (d.kind) {
        case "pill":
            return (
                <span
                    className={cn(
                        "inline-flex min-h-7 w-fit items-center rounded-full px-2.5 text-[12px] font-semibold",
                        d.tone === "warn"
                            ? "bg-[#FBE4E0] text-[#A02A16]"
                            : d.tone === "paid"
                              ? "bg-mk-ok-tint text-mk-ok"
                              : "bg-card text-[hsl(var(--foreground))] shadow-[inset_0_0_0_1px_hsl(var(--border))]",
                    )}
                >
                    {d.text}
                </span>
            );
        case "bar":
            return (
                <span className="grid w-full max-w-[240px] gap-1.5 rounded-[10px] bg-card p-2.5 text-[hsl(var(--foreground))]">
                    <span className="flex justify-between gap-3 text-[12px]">
                        <b className="font-semibold">{d.label}</b>
                        <span className="font-mono">
                            {d.n} of {d.of}
                        </span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-[#ECE7DC]">
                        <span
                            className="block h-full bg-foreground"
                            style={{
                                width: `${Math.round((100 * d.n) / d.of)}%`,
                            }}
                        />
                    </span>
                </span>
            );
        case "slots":
            return (
                <span className="grid gap-1.5">
                    <span aria-hidden className="flex gap-1">
                        {Array.from({ length: d.of }, (_, i) => (
                            <span
                                key={i}
                                className={cn(
                                    "h-3 w-4 rounded-[3px]",
                                    i < d.taken
                                        ? "bg-current"
                                        : "bg-current/20",
                                )}
                            />
                        ))}
                    </span>
                    <b className="text-[12px] font-semibold">{d.label}</b>
                </span>
            );
        case "bill":
            return (
                <span className="flex w-full max-w-[240px] justify-between gap-3 rounded-[10px] bg-card px-2.5 py-2 text-[12px] text-[hsl(var(--foreground))]">
                    <span>{d.label}</span>
                    <b className="font-mono">{d.amount}</b>
                </span>
            );
    }
}

function Tile({ t, words }: { t: HubTile; words: HubFinderWords }) {
    const tint = hourTint(t.at);
    return (
        <a
            href={t.href}
            className={cn(
                "group grid h-full content-start gap-2 rounded-mk-card border p-5 no-underline transition-shadow duration-fast ease-out hover:border-foreground",
                TONE_BAND[tint],
                t.flagship
                    ? "border-[1.5px] border-brand-500"
                    : "border-border",
                ring(),
            )}
        >
            <span className="flex items-start justify-between gap-3">
                <span className="font-mono text-[13px] font-medium">
                    {clockLabel(t.at)}
                </span>
                <SunArc at={t.at} className="w-12" />
            </span>
            <h3 className="m-0 font-display text-mk-kit-h3 font-bold text-foreground">
                {t.name}
            </h3>
            <span className="text-[15px] leading-snug text-mk-copy">
                {t.line}
            </span>
            {t.detail ? (
                <span className="mt-2 flex">
                    <Detail d={t.detail} />
                </span>
            ) : null}
            {t.flagship ? (
                <span className="mt-1 text-[13px] font-semibold text-brand-700 [.bg-mk-lamp_&]:text-mk-lamp-saff">
                    {words.flagship}
                </span>
            ) : null}
        </a>
    );
}

/**
 * The /for hub's search, filters and trades (boards SOHubDesk, SOHubPhone2).
 * Every trade's link is in the page's HTML; the filters, kept in the
 * address, only hide them in the browser. On a phone each group is a swipe
 * row and every trade is also in the closed A to Z list.
 */
export function HubFinder({
    intro,
    door,
    groups,
    words,
}: {
    /** The hero's words: crumbs, h1 and lead. */
    intro: ReactNode;
    /** The one-line door to a written day, under the hero. */
    door?: ReactNode;
    groups: HubGroupView[];
    words: HubFinderWords;
}) {
    // The server draws no filters: every trade is in the page's HTML.
    const search = useSyncExternalStore(
        subscribeAddress,
        () => window.location.search,
        () => "",
    );
    const filters = readFilters(search, groups);
    const { family, way, query } = filters;
    const change = (next: Partial<Filters>) =>
        setAddress({ ...filters, ...next }, "pushState");

    const every = groups.flatMap((g) =>
        g.tiles.map((t) => ({ ...t, group: g.id })),
    );
    const count = (f: string | null, w: HubWay | null) =>
        every.filter(
            (t) =>
                matches(t, query) &&
                (!f || t.group === f) &&
                (!w || t.way === w),
        ).length;
    const shown = every.filter(
        (t) =>
            matches(t, query) &&
            (!family || t.group === family) &&
            (!way || t.way === way),
    );
    const shownSlugs = new Set(shown.map((t) => t.slug));
    const filtering = family !== null || way !== null || query !== "";
    const az = [...every].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <>
            <div className="bg-mk-dawn">
                <div className="mx-auto grid max-w-mk-page grid-cols-[minmax(0,1fr)] gap-6 px-mk-gutter pb-6 pt-4 min-[760px]:gap-8 min-[760px]:pb-10 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,560px)] min-[1000px]:gap-16 min-[1000px]:pb-14">
                    <div className="grid content-start">{intro}</div>
                    <div className="grid content-start gap-4 min-[1000px]:pt-14">
                        <div
                            role="search"
                            className="flex h-[52px] items-center gap-3 rounded-[14px] border border-border bg-card px-4 shadow-mk-card focus-within:ring-2 focus-within:ring-foreground"
                        >
                            <Search
                                aria-hidden
                                className="size-5 shrink-0 text-mk-copy"
                            />
                            <label className="sr-only" htmlFor="for-hub-search">
                                {words.searchLabel}
                            </label>
                            <input
                                id="for-hub-search"
                                type="search"
                                placeholder={words.searchPlaceholder}
                                value={query}
                                onChange={(e) =>
                                    setAddress(
                                        { ...filters, query: e.target.value },
                                        "replaceState",
                                    )
                                }
                                className={fieldClasses({
                                    bare: true,
                                    className: "h-full",
                                })}
                            />
                        </div>
                        <div
                            role="group"
                            aria-label={words.what}
                            className="-mr-mk-gutter flex gap-2 overflow-x-auto pr-mk-gutter [scrollbar-width:none] min-[760px]:mr-0 min-[760px]:flex-wrap min-[760px]:pr-0 [&::-webkit-scrollbar]:hidden"
                        >
                            <Chip
                                on={!family}
                                count={count(null, way)}
                                onClick={() => change({ family: null })}
                                className="shrink-0"
                            >
                                {words.all}
                            </Chip>
                            {groups.map((g) => (
                                <Chip
                                    key={g.id}
                                    on={family === g.id}
                                    count={count(g.id, way)}
                                    onClick={() => change({ family: g.id })}
                                    className="shrink-0"
                                >
                                    {g.title}
                                </Chip>
                            ))}
                        </div>
                        <div
                            role="group"
                            aria-label={words.howShort}
                            className="-mr-mk-gutter flex items-center gap-2 overflow-x-auto pr-mk-gutter [scrollbar-width:none] min-[760px]:mr-0 min-[760px]:flex-wrap min-[760px]:pr-0 [&::-webkit-scrollbar]:hidden"
                        >
                            <span className="shrink-0 text-[13px] text-mk-copy">
                                {words.howShort}
                            </span>
                            {WAYS.map((w) => (
                                <Chip
                                    key={w}
                                    on={way === w}
                                    count={count(family, w)}
                                    onClick={() =>
                                        change({ way: way === w ? null : w })
                                    }
                                    className="shrink-0"
                                >
                                    {words.ways[w]}
                                </Chip>
                            ))}
                        </div>
                        <p className="m-0 flex min-h-11 items-center gap-4 text-[14px] text-mk-copy">
                            <span aria-live="polite">
                                {shown.length === every.length
                                    ? fill(words.count.all, {
                                          every: every.length,
                                      })
                                    : fill(words.count.some, {
                                          shown: shown.length,
                                          every: every.length,
                                      })}
                            </span>
                            {filtering ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setAddress(
                                            {
                                                family: null,
                                                way: null,
                                                query: "",
                                            },
                                            "pushState",
                                        )
                                    }
                                    className={cn(
                                        "min-h-11 cursor-pointer border-none bg-transparent p-0 text-[14px] font-semibold text-foreground underline underline-offset-4",
                                        ring(),
                                    )}
                                >
                                    {words.reset}
                                </button>
                            ) : null}
                        </p>
                    </div>
                </div>
                <div className="mx-auto grid max-w-mk-page grid-cols-[minmax(0,1fr)] gap-4 px-mk-gutter pb-4 min-[760px]:pb-10">
                    <details className="group rounded-mk-card border border-border bg-card min-[760px]:hidden">
                        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 [&::-webkit-details-marker]:hidden">
                            <span className="grid">
                                <b className="font-display text-[20px] tracking-[-0.025em]">
                                    {words.az}
                                </b>
                                <span className="text-[13px] text-mk-copy">
                                    {words.azLine}
                                </span>
                            </span>
                            <ChevronDown
                                aria-hidden
                                className="size-5 transition-transform group-open:rotate-180"
                            />
                        </summary>
                        <ul className="m-0 grid list-none grid-cols-2 gap-x-4 px-5 pb-5">
                            {az.map((t) => (
                                <li key={t.slug}>
                                    <a
                                        href={t.href}
                                        className="flex min-h-11 items-center text-[15px] text-foreground"
                                    >
                                        {t.name}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </details>
                    {door}
                </div>
            </div>
            <div className="mx-auto grid max-w-mk-page grid-cols-[minmax(0,1fr)] gap-0 px-mk-gutter">
                {shown.length === 0 && query.trim() ? (
                    <h2 className="m-0 py-10 font-display text-mk-kit-h2 font-bold min-[760px]:py-16">
                        {fill(words.none, { q: query.trim() })}
                    </h2>
                ) : null}
                {groups.map((g) => {
                    const tiles = g.tiles.filter((t) => shownSlugs.has(t.slug));
                    return (
                        <section
                            key={g.id}
                            id={g.id}
                            aria-labelledby={`g-${g.id}`}
                            hidden={tiles.length === 0}
                            className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-border py-7 first:border-t-0 min-[760px]:gap-6 min-[760px]:py-12 min-[1000px]:grid-cols-[260px_minmax(0,1fr)] min-[1000px]:gap-12 min-[1000px]:py-16"
                        >
                            <div className="grid content-start gap-2">
                                <h2
                                    id={`g-${g.id}`}
                                    className="m-0 font-display text-[30px] font-bold leading-tight tracking-[-0.035em]"
                                >
                                    {g.title}
                                </h2>
                                <p className="m-0 font-mono text-[13px] text-mk-copy">
                                    {fill(
                                        g.tiles.length === 1 && words.trade
                                            ? words.trade
                                            : words.trades,
                                        { n: g.tiles.length },
                                    )}
                                </p>
                                <p className="m-0 text-[15px] leading-snug text-mk-copy">
                                    {g.how}
                                </p>
                            </div>
                            <SwipeRow label={g.title} columns={3}>
                                {tiles.map((t) => (
                                    <Tile key={t.slug} t={t} words={words} />
                                ))}
                            </SwipeRow>
                        </section>
                    );
                })}
            </div>
        </>
    );
}
