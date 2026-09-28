"use client";

import { useCallback, useEffect, useState } from "react";

import type { RenderedPacks } from "@saroh/block-contract";

import { BuyPackSheet } from "../account/buy-pack-sheet";
import { accountMoney } from "../account/model";
import type { AccountPackOnSale } from "../account/packs-api";
import { DEFAULT_API_URL } from "../api-url";
import { cn } from "../lib/utils";
import type { PricesActions } from "../prices/api";
import { PricesDone, useSignInFirst } from "../prices/flow";
import type { PublicPack } from "../prices/pack-words";
import { packEyebrow, packPerClass, packsOf } from "../prices/pack-words";
import { askAboutHref } from "../shop/ask-about-ordering";

/**
 * `packs` v1 — the business's class packs on sale, read live (G20; Saroh
 * Customer Site design, the Prices page's Class packs).
 *
 * The section stores a title, a button label and one switch. The packs come
 * from `GET public/sites/:siteId/packs`, which serves only packs on sale
 * with their PUBLISHED values (never a draft or an unpublished change) and
 * 404s while Class packs is off for the business. Two ways in, as the Plans
 * block has:
 *
 * - **`feed`** — handed in by the page that serves the site, read on the
 *   server. No packs: the block renders NOTHING.
 * - **no feed, a `siteId`** — the editor's canvas, which reads the same list
 *   itself and says why the section is empty rather than vanishing.
 *
 * Each card says how many classes and for how long, the price per class
 * against a single class's, and the price. **Buy** is A11's purchase: the
 * customer signs in first (always on, no guest path), then the Buy a pack
 * sheet opens the business's own provider window. Where the site hands in
 * no actions, or the business can't take the payment online, the button is
 * "Ask about this pack" instead, opening the enquiry form with the pack
 * named; with no enquiry form, no button. Nothing names a way to pay
 * (DEC-059).
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

export { packEyebrow, packPerClass, packsOf } from "../prices/pack-words";
export type { PublicPack } from "../prices/pack-words";

/** The packs to show, and what their button can do. */
export interface PacksFeed {
    packs: PublicPack[];
    /** Whether a signed-in customer can buy online now. */
    payOnline: boolean;
    /**
     * The page holding the site's enquiry form, or null when the site has
     * none (no "Ask about this pack").
     */
    askHref: string | null;
}

/** What the section is called when the merchant left the title empty. */
export const PACKS_TITLE = "Class packs";

/** The button's words when the customer can buy online. */
export const PACKS_BUY = "Buy";

/** The button's words when they can't. */
export const PACKS_ASK = "Ask about this pack";

/** The pack as the Buy a pack sheet (A11) sells it. */
function onSale(pack: PublicPack): AccountPackOnSale {
    return {
        ref: pack.id,
        name: pack.name,
        description: pack.description,
        credits: pack.credits,
        validityDays: pack.validityDays,
        price: pack.price,
        currency: pack.currency,
    };
}

/** A value with something in it, else null: an empty string says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; packs: PublicPack[]; payOnline: boolean }
    /** 404: Class packs is off, or the site isn't one the API serves. */
    | { kind: "off" }
    | { kind: "error" };

export default function PacksSection({
    content,
    feed,
    prices = null,
    siteId,
    apiUrl = DEFAULT_API_URL,
}: {
    content: RenderedPacks;
    /** The packs, read by the page that serves the site. */
    feed?: PacksFeed;
    /** Buy's actions, from the live site when the account area is on. */
    prices?: PricesActions | null;
    /**
     * The site, when the block reads its packs itself (the editor's canvas).
     * Null: a live render that could not tell, so nothing is drawn.
     * Undefined: no site at all; the block says what will show.
     */
    siteId?: string | null;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
}) {
    const reads = feed === undefined && typeof siteId === "string";
    const [state, setState] = useState<LoadState>({ kind: "loading" });

    const load = useCallback(async (): Promise<LoadState> => {
        if (typeof siteId !== "string") return { kind: "error" };
        try {
            const res = await fetch(
                `${apiUrl}/public/sites/${encodeURIComponent(siteId)}/packs`,
                { headers: { accept: "application/json" } },
            );
            if (res.status === 404) return { kind: "off" };
            if (!res.ok) return { kind: "error" };
            const read = packsOf(await res.json().catch(() => null));
            return read ? { kind: "ready", ...read } : { kind: "error" };
        } catch {
            return { kind: "error" };
        }
    }, [apiUrl, siteId]);

    useEffect(() => {
        if (!reads) return;
        let active = true;
        void load().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [reads, load]);

    const title = said(content.title) ?? PACKS_TITLE;

    if (feed) {
        return (
            <PackCards
                content={content}
                title={title}
                feed={feed}
                prices={prices}
            />
        );
    }
    if (siteId === null) return null;
    if (siteId === undefined) {
        return (
            <PacksNote title={title}>
                Your class packs on sale show here on your live site, with how
                many classes, how long they last and the price.
            </PacksNote>
        );
    }
    if (state.kind === "loading") {
        return (
            <PacksNote title={title} busy>
                Loading your packs…
            </PacksNote>
        );
    }
    if (state.kind === "error") {
        return (
            <PacksNote
                title={title}
                action={
                    <button
                        type="button"
                        onClick={() => {
                            setState({ kind: "loading" });
                            void load().then(setState);
                        }}
                        className={textButton}
                    >
                        Try again
                    </button>
                }
            >
                We couldn&apos;t load your packs just now.
            </PacksNote>
        );
    }
    if (state.kind === "off" || state.packs.length === 0) {
        return (
            <PacksNote title={title}>
                No packs on sale yet. Publish a class pack and it shows here;
                until then this section is left off your live site.
            </PacksNote>
        );
    }
    return (
        <PackCards
            content={content}
            title={title}
            // The canvas has no enquiry page to hand: the button is drawn,
            // not followed.
            feed={{
                packs: state.packs,
                payOnline: state.payOnline,
                askHref: null,
            }}
            canvas
        />
    );
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const textButton = cn(
    "cursor-pointer rounded-[var(--site-radius)] text-sm font-semibold text-site-accent underline-offset-4 transition-opacity hover:underline active:opacity-70",
    focusRing,
);

/* The design's card button: the merchant's accent, the site's radius. */
const buyButton =
    "inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-[var(--site-radius)] bg-site-accent px-3.5 text-[13.5px] font-bold text-site-accent-fg";

const liveButton = cn(
    buyButton,
    "cursor-pointer transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]",
    focusRing,
);

function PacksFrame({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h2 className="font-site-heading text-site-fg mb-3.5 text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]">
                {title}
            </h2>
            {children}
        </section>
    );
}

/** Said where there is nothing to list: the canvas, never the live site. */
function PacksNote({
    title,
    busy = false,
    action,
    children,
}: {
    title: string;
    busy?: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <PacksFrame title={title}>
            <div
                role={action ? "alert" : "status"}
                aria-busy={busy || undefined}
                className="border-site-border text-site-body grid justify-items-start gap-2 rounded-[calc(var(--site-radius)*1.4)] border border-dashed p-5 text-sm leading-relaxed"
            >
                <p>{children}</p>
                {action ?? null}
            </div>
        </PacksFrame>
    );
}

function PackCards({
    content,
    title,
    feed,
    prices = null,
    canvas = false,
}: {
    content: RenderedPacks;
    title: string;
    feed: PacksFeed;
    prices?: PricesActions | null;
    /** Drawn in the editor: the button shows its words but goes nowhere. */
    canvas?: boolean;
}) {
    const buys = prices !== null && feed.payOnline;
    const flow = useSignInFirst(buys ? prices : null);
    const [buying, setBuying] = useState<PublicPack | null>(null);
    const [done, setDone] = useState<string | null>(null);
    if (feed.packs.length === 0) return null;
    const showDescriptions = content.showDescriptions !== false;
    const buyWords = buys || (canvas && feed.payOnline);
    const label =
        said(content.buttonLabel) ?? (buyWords ? PACKS_BUY : PACKS_ASK);

    function buy(pack: PublicPack) {
        setDone(null);
        flow.signedIn(() => setBuying(pack));
    }

    return (
        <PacksFrame title={title}>
            {done && prices ? (
                <PricesDone message={done} accountHref={prices.accountHref} />
            ) : null}
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
                {feed.packs.map((pack) => {
                    const perClass = packPerClass(pack);
                    const description = showDescriptions
                        ? said(pack.description)
                        : null;
                    return (
                        <li
                            key={pack.id}
                            className="bg-site-surface text-site-fg border-site-border grid min-w-0 content-start gap-1.5 overflow-hidden rounded-[calc(var(--site-radius)*1.4)] border p-4"
                        >
                            <span className="text-site-muted text-[11.5px] font-bold uppercase tracking-[0.08em]">
                                {packEyebrow(pack)}
                            </span>
                            <h3 className="font-site-heading text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em]">
                                {pack.name}
                            </h3>
                            {perClass ? (
                                <p className="text-site-body text-[13.5px] leading-normal [text-wrap:pretty]">
                                    {perClass}
                                </p>
                            ) : null}
                            {description ? (
                                <p className="text-site-body text-[13.5px] leading-normal [text-wrap:pretty]">
                                    {description}
                                </p>
                            ) : null}
                            <span className="mt-1.5 flex items-center gap-2.5">
                                <span className="flex-1 text-base font-bold">
                                    {accountMoney(pack.price, pack.currency)}
                                </span>
                                {canvas ? (
                                    <span className={buyButton}>{label}</span>
                                ) : buys ? (
                                    <button
                                        type="button"
                                        onClick={() => buy(pack)}
                                        aria-label={`${label}: ${pack.name}`}
                                        className={liveButton}
                                    >
                                        {label}
                                    </button>
                                ) : feed.askHref ? (
                                    <a
                                        href={askAboutHref(
                                            feed.askHref,
                                            pack.name,
                                            "pack",
                                        )}
                                        aria-label={`${label}: ${pack.name}`}
                                        className={liveButton}
                                    >
                                        {label}
                                    </a>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {buys ? (
                <>
                    {flow.sheet}
                    {flow.customer ? (
                        <BuyPackSheet
                            open={buying !== null}
                            onClose={() => setBuying(null)}
                            onSale={{
                                payOnline: true,
                                packs: buying ? [onSale(buying)] : [],
                            }}
                            businessName={prices.businessName}
                            customer={flow.customer}
                            api={prices.packs}
                            onBought={(message) => {
                                setBuying(null);
                                setDone(message);
                            }}
                        />
                    ) : null}
                </>
            ) : null}
        </PacksFrame>
    );
}
