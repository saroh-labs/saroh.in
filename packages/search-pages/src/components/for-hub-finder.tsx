"use client";

import { useState, useSyncExternalStore } from "react";

import type { Scene, Shape } from "../schema";
import { ClosingBand } from "./page-parts";

export interface HubTrade {
    slug: string;
    name: string;
    line: string;
    href?: string;
    family: string;
    shape: Shape;
    /** Lower-case: its name, family, search phrase and the owner's other words. */
    words: string;
}

export interface HubFamily {
    name: string;
    slug: string;
    trades: HubTrade[];
}

export interface HubLinks {
    home?: string;
    startFree?: string;
    startFreeLabel?: string;
    /** The band button's `data-cta`. */
    src?: string;
    /** Under the band's button; none before the launch switch opens. */
    note?: string;
}

/** Plain words for how a trade's customers reach it, never our product's. */
const WAYS: { shape: Shape; name: string }[] = [
    { shape: "appointments", name: "They book a time" },
    { shape: "classes", name: "They join a class or batch" },
    { shape: "orders", name: "They place an order" },
];

const CHANGED = "saroh:for-hub-filters";

const subscribe = (onChange: () => void) => {
    window.addEventListener("popstate", onChange);
    window.addEventListener(CHANGED, onChange);
    return () => {
        window.removeEventListener("popstate", onChange);
        window.removeEventListener(CHANGED, onChange);
    };
};

/** The filters live in the address, so a link keeps them and Back undoes them. */
function setAddress(next: Filters, how: "pushState" | "replaceState") {
    const params = new URLSearchParams();
    if (next.family) params.set("family", next.family);
    if (next.way) params.set("how", next.way);
    if (next.query) params.set("q", next.query);
    const search = params.toString();
    window.history[how](
        null,
        "",
        search
            ? `${window.location.pathname}?${search}`
            : window.location.pathname,
    );
    window.dispatchEvent(new Event(CHANGED));
}

interface Filters {
    family: string | null;
    way: Shape | null;
    query: string;
}

function readFilters(search: string, families: HubFamily[]): Filters {
    const params = new URLSearchParams(search);
    const family = params.get("family");
    const way = WAYS.find((w) => w.shape === params.get("how"))?.shape ?? null;
    return {
        family: families.some((f) => f.slug === family) ? family : null,
        way,
        query: params.get("q") ?? "",
    };
}

/** Every word of the search is somewhere in the trade's words. */
const matches = (t: HubTrade, query: string) =>
    query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => t.words.includes(word));

export function ForHubFinder({
    families,
    leads,
    heroes,
    links,
}: {
    families: HubFamily[];
    leads: HubTrade[];
    heroes: Record<string, Scene["hero"]>;
    links: HubLinks;
}) {
    // The server draws no filters: every trade is in the page's HTML.
    const search = useSyncExternalStore(
        subscribe,
        () => window.location.search,
        () => "",
    );
    const [moreOpen, setMoreOpen] = useState(false);
    const filters = readFilters(search, families);
    const { family, way, query } = filters;
    const change = (next: Partial<Filters>) =>
        setAddress({ ...filters, ...next }, "pushState");

    const every = families.flatMap((f) => f.trades);
    const count = (f: string | null, w: Shape | null) =>
        every.filter(
            (t) =>
                matches(t, query) &&
                (!f || t.family === f) &&
                (!w || t.shape === w),
        ).length;
    const shown = every.filter(
        (t) =>
            matches(t, query) &&
            (!family || t.family === family) &&
            (!way || t.shape === way),
    );
    const chosen = families.find((f) => f.slug === family);
    const filtering = family !== null || way !== null || query !== "";
    const lead =
        !query && !way && shown.length >= 4
            ? chosen
                ? chosen.trades.slice(0, 4)
                : leads
            : [];
    const big = lead[0];
    const bigDay = big ? heroes[big.slug] : undefined;
    const inLead = new Set(lead.map((t) => t.slug));
    const groups = families
        .filter((f) => !family || f.slug === family)
        .map((f) => ({
            ...f,
            trades: shown.filter(
                (t) => t.family === f.slug && !inLead.has(t.slug),
            ),
        }))
        .filter((f) => f.trades.length > 0);

    return (
        <div className="sp-fh-layout">
            <aside className="sp-fh-rail">
                <div className="sp-fh-search">
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                    </svg>
                    <label className="sp-fh-sr" htmlFor="for-hub-search">
                        Search trades
                    </label>
                    <input
                        id="for-hub-search"
                        type="search"
                        placeholder="Dentist, bakery…"
                        value={query}
                        onChange={(e) =>
                            setAddress(
                                { ...filters, query: e.target.value },
                                "replaceState",
                            )
                        }
                    />
                </div>
                <div
                    className="sp-fh-opts"
                    role="group"
                    aria-labelledby="for-hub-what"
                >
                    <h2 id="for-hub-what" className="sp-fh-opts-h">
                        What you do
                    </h2>
                    <Option
                        name="All"
                        on={!family}
                        count={count(null, way)}
                        onPick={() => change({ family: null })}
                    />
                    {families.map((f) => (
                        <Option
                            key={f.slug}
                            name={f.name}
                            on={family === f.slug}
                            count={count(f.slug, way)}
                            onPick={() => change({ family: f.slug })}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    className="sp-fh-more"
                    aria-expanded={moreOpen || Boolean(way)}
                    aria-controls="for-hub-ways"
                    onClick={() => setMoreOpen(!moreOpen)}
                >
                    How customers come to you
                </button>
                <div
                    id="for-hub-ways"
                    className="sp-fh-opts sp-fh-ways"
                    data-open={moreOpen || Boolean(way)}
                    role="group"
                    aria-labelledby="for-hub-how"
                >
                    <h2 id="for-hub-how" className="sp-fh-opts-h">
                        How customers come to you
                    </h2>
                    <Option
                        name="Any way"
                        on={!way}
                        count={count(family, null)}
                        onPick={() => change({ way: null })}
                    />
                    {WAYS.map((w) => (
                        <Option
                            key={w.shape}
                            name={w.name}
                            on={way === w.shape}
                            count={count(family, w.shape)}
                            onPick={() => change({ way: w.shape })}
                        />
                    ))}
                </div>
            </aside>
            <div className="sp-fh-results" data-lines={filtering}>
                <div className="sp-fh-status">
                    <p aria-live="polite">
                        {shown.length === every.length
                            ? `All ${every.length} trades`
                            : `${shown.length} of ${every.length} trades`}
                    </p>
                    {filtering ? (
                        <button
                            type="button"
                            onClick={() =>
                                setAddress(
                                    { family: null, way: null, query: "" },
                                    "pushState",
                                )
                            }
                        >
                            Reset all
                        </button>
                    ) : null}
                </div>
                {big ? (
                    <div className="sp-fh-bento">
                        <a className="sp-fh-tile sp-fh-big" href={big.href}>
                            <span className="sp-fh-tile-copy">
                                <span className="sp-fh-tile-name">
                                    {big.name}
                                    <span
                                        aria-hidden="true"
                                        className="sp-fh-go"
                                    >
                                        →
                                    </span>
                                </span>
                                <span className="sp-fh-tile-line">
                                    {big.line}
                                </span>
                            </span>
                            {bigDay ? (
                                <span className="sp-fh-day" aria-hidden="true">
                                    <span className="sp-fh-day-top">
                                        <b>{bigDay.title}</b>
                                        <span>{bigDay.count}</span>
                                    </span>
                                    {bigDay.rows.map((r) => (
                                        <span
                                            className="sp-fh-day-row"
                                            key={r.time}
                                        >
                                            <span>{r.time}</span>
                                            <b>{r.name}</b>
                                            <span>{r.right}</span>
                                        </span>
                                    ))}
                                </span>
                            ) : null}
                        </a>
                        <div className="sp-fh-side">
                            {lead.slice(1).map((t) => (
                                <TradeLink key={t.slug} trade={t} tile />
                            ))}
                        </div>
                    </div>
                ) : null}
                {groups.map((g) => (
                    <section className="sp-fh-group" key={g.slug}>
                        {family ? null : (
                            <h2 className="sp-fh-group-h">{g.name}</h2>
                        )}
                        <div className="sp-fh-cards">
                            {g.trades.map((t) => (
                                <TradeLink key={t.slug} trade={t} />
                            ))}
                        </div>
                    </section>
                ))}
                <ClosingBand
                    look="wide"
                    className="sp-fh-band"
                    title={
                        shown.length === 0 && query.trim()
                            ? `No page for "${query.trim()}" yet`
                            : "Don't see your trade?"
                    }
                    line="Saroh runs on bookings, classes and orders. If your business uses any of them, it can run on Saroh."
                    href={links.startFree}
                    label={links.startFreeLabel}
                    src={links.src}
                    note={links.note}
                />
            </div>
        </div>
    );
}

function Option({
    name,
    on,
    count,
    onPick,
}: {
    name: string;
    on: boolean;
    count: number;
    onPick: () => void;
}) {
    return (
        <button
            type="button"
            className="sp-fh-opt"
            aria-pressed={on}
            // Nothing to show there: it can't be chosen, so it can't dead-end.
            disabled={count === 0 && !on}
            onClick={onPick}
        >
            {name}
            <span className="sp-fh-opt-n">{count}</span>
        </button>
    );
}

function TradeLink({
    trade,
    tile = false,
}: {
    trade: HubTrade;
    tile?: boolean;
}) {
    return (
        <a
            className={tile ? "sp-fh-tile sp-fh-small" : "sp-fh-card"}
            href={trade.href}
        >
            <span className="sp-fh-tile-copy">
                <span className="sp-fh-tile-name">
                    {trade.name}
                    <span aria-hidden="true" className="sp-fh-go">
                        →
                    </span>
                </span>
                <span className="sp-fh-tile-line">{trade.line}</span>
            </span>
            <svg aria-hidden="true" className="sp-fh-chev" viewBox="0 0 24 24">
                <path d="m9 6 6 6-6 6" />
            </svg>
        </a>
    );
}
