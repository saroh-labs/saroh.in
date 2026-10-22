"use client";

import { useCallback, useEffect, useState } from "react";

import type { LookId, RenderedPlans } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import type { AutopayMethod } from "../autopay/api";
import { gstUnderWords } from "../lib/gst-price";
import type { PublicPlan } from "../lib/plans-read";
import {
    isPublicPlan,
    plansAutopayMethods,
    plansNotTakingOrders,
    plansOf,
    plansOffered,
    plansPayOnline,
} from "../lib/plans-read";
import { cn } from "../lib/utils";
import type { LookProps } from "../look-context";
import type { PricesActions } from "../prices/api";
import { PricesDone, useSignInFirst } from "../prices/flow";
import type { JoinablePlan } from "../prices/join-sheet";
import { JoinSheet } from "../prices/join-sheet";
import { planBrowsePrice, planEvery, planPrice } from "../prices/plan-words";
import { askAboutHref } from "../shop/ask-about-ordering";
import { NotTakingOrders } from "../shop/not-taking-orders";
import {
    PriceFrame,
    PriceParts,
    priceButton,
    priceColumn,
    priceList,
    weeksWords,
} from "./prices-look";

/**
 * `plans` v1 — the business's subscription plans on sale, read live (G9).
 *
 * The section stores a title, a line under it (template polish), a
 * highlight, a button label and one switch.
 * The plans come from `GET public/sites/:siteId/plans`, which serves only
 * plans on sale with their PUBLISHED values (never a draft or an unpublished
 * change) and 404s while Payments is off for the business. Two ways in:
 *
 * - **`feed`** — handed in by the page that serves the site (live or behind
 *   a preview token), read on the server. No plans (none on sale, Payments
 *   off, memberships not on the business's Saroh plan, the read failed):
 *   the block renders NOTHING.
 * - **no feed, a `siteId`** — the editor's canvas. The block reads the same
 *   public list itself so the merchant sees their real plans, and says why
 *   the section is empty rather than vanishing.
 *
 * With neither (`siteId` undefined) it says where the plans come from.
 * `siteId` null is a live render that could not tell, and draws nothing.
 *
 * **The button never promises what the site can't do.** Where the live
 * site hands in its Join actions and the business can take the payment
 * online (`payOnline`), it is "Join": the join sheet (G20), signing in
 * first. Otherwise it opens the site's enquiry form with the plan named:
 * "Ask about joining". A site with neither shows no button. No copy here
 * names a way to pay (DEC-059) or promises automatic renewals: autopay is
 * offered only in the join sheet, from the provider's own list (D12).
 *
 * **GST is said before Join.** Where the read carries a plan's `gst`, the
 * amount beside Join is the amount to pay each period, with the GST in or
 * on it under it: "₹2,360 / month" over "₹2,000 + ₹360 GST (18%)", or
 * "₹2,000 / month" over "Includes ₹305.08 GST (18%)". A card that is only
 * browsed (no Join) keeps the typed price, with "+ GST" after it when GST
 * comes on top. The API's numbers, only written out.
 *
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

// The read's checks live beside the server's use of them (lib/plans-read).
export {
    isPublicPlan,
    plansAutopayMethods,
    plansNotTakingOrders,
    plansOf,
    plansPayOnline,
};
export type { PublicPlan };

/** The plans to show and where their button goes. */
export interface PlansFeed {
    plans: PublicPlan[];
    /**
     * The page holding the site's enquiry form, e.g. `/contact#enquiry`, or
     * null when the site has none (no button is drawn).
     */
    joinHref: string | null;
    /**
     * Whether a signed-in customer can join online now (G20): the business
     * can take the payment. Absent or false: "Ask about joining".
     */
    payOnline?: boolean;
    /**
     * Every way the business's provider can take autopay (D12), for the
     * join sheet's "Pay with". Absent or empty: autopay isn't offered.
     */
    autopayMethods?: AutopayMethod[];
    /**
     * The business isn't taking orders on this site just now (#800): the
     * plans show, with no button, and the section says so.
     */
    notTakingOrders?: boolean;
    /**
     * How long a member may pause, in weeks (DEC-172 U7), from the read:
     * said beside the plans under a look. Absent or empty: pausing isn't
     * offered, and nothing is said about it.
     */
    pauseWeeks?: number[];
}

/** What the section is called when the merchant left the title empty. */
export const PLANS_TITLE = "Plans";

/** The button's words when the merchant left them empty. */
export const PLANS_BUTTON = "Ask about joining";

/** The button's words where the customer can join online (G20). */
export const PLANS_JOIN = "Join";

/** The badge on a highlighted plan that more members chose than any other. */
export const MOST_CHOSEN = "Most chosen";

// Said the same way on the cards and in the join sheet (G20).
export { planEvery, planPrice };

/** Where a plan's button goes: the enquiry form, with the plan named. */
export function joinHref(enquiryHref: string, planName: string): string {
    return askAboutHref(enquiryHref, planName, "join");
}

/** A value with something in it, else null: an empty string says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; plans: PublicPlan[]; payOnline: boolean }
    /** 404: Payments is off, or the site isn't one the API serves. */
    | { kind: "off" }
    /** The business's Saroh plan leaves memberships off: none listed. */
    | { kind: "unoffered" }
    | { kind: "error" };

export default function PlansSection({
    content,
    feed,
    prices = null,
    siteId,
    apiUrl = DEFAULT_API_URL,
    look,
}: LookProps & {
    content: RenderedPlans;
    /** The plans, read by the page that serves the site (live or preview). */
    feed?: PlansFeed;
    /**
     * Join's actions, handed in by the live site when the account area is
     * on (G20). Null: the button asks about joining instead.
     */
    prices?: PricesActions | null;
    /**
     * The site, when the block reads its plans itself (the editor's canvas).
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
                `${apiUrl}/public/sites/${encodeURIComponent(siteId)}/plans`,
                { headers: { accept: "application/json" } },
            );
            if (res.status === 404) return { kind: "off" };
            if (!res.ok) return { kind: "error" };
            const body: unknown = await res.json().catch(() => null);
            const plans = plansOf(body);
            if (plans && !plansOffered(body)) return { kind: "unoffered" };
            return plans
                ? { kind: "ready", plans, payOnline: plansPayOnline(body) }
                : { kind: "error" };
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

    const title = said(content.title) ?? PLANS_TITLE;

    if (feed) {
        return (
            <PlanCards
                content={content}
                title={title}
                feed={feed}
                prices={prices}
                apiUrl={apiUrl}
                look={look}
            />
        );
    }
    if (siteId === null) return null;
    if (siteId === undefined) {
        return (
            <PlansNote title={title}>
                Your plans on sale show here on your live site, with their price
                and how often.
            </PlansNote>
        );
    }
    if (state.kind === "loading") {
        return (
            <PlansNote title={title} busy>
                Loading your plans…
            </PlansNote>
        );
    }
    if (state.kind === "error") {
        return (
            <PlansNote
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
                We couldn&apos;t load your plans right now.
            </PlansNote>
        );
    }
    if (state.kind === "off") {
        return (
            <PlansNote title={title}>
                Payments is off, so this section is left off your live site.
                Turn Payments on and publish a plan, and your plans show here.
            </PlansNote>
        );
    }
    if (state.kind === "unoffered") {
        return (
            <PlansNote title={title}>
                Memberships aren&apos;t on your Saroh plan, so this section is
                left off your live site. Members you already have keep renewing.
                Upgrade and your plans show here again.
            </PlansNote>
        );
    }
    if (state.plans.length === 0) {
        return (
            <PlansNote title={title}>
                No plans on sale yet. Publish a plan and it shows here. Until
                then this section is left off your live site.
            </PlansNote>
        );
    }
    return (
        <PlanCards
            content={content}
            title={title}
            // The canvas has no enquiry page to hand: the button is drawn,
            // not followed.
            feed={{
                plans: state.plans,
                joinHref: null,
                payOnline: state.payOnline,
            }}
            canvas
            look={look}
        />
    );
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

const textButton = cn(
    "cursor-pointer rounded-[var(--site-radius)] text-sm font-semibold text-site-accent-text underline-offset-4 transition-opacity hover:underline active:opacity-70",
    focusRing,
);

/*
 * The design's card button: the merchant's accent, the site's radius.
 * 38px under a mouse, 44px under a finger.
 */
const joinButton =
    "coarse:h-11 inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-[var(--site-radius)] bg-site-accent px-3.5 text-[13.5px] font-bold text-site-accent-fg";

function PlansFrame({
    title,
    intro = null,
    children,
}: {
    title: string;
    /** A line under the title (template polish); the merchant's own words. */
    intro?: string | null;
    children: React.ReactNode;
}) {
    return (
        <section className="mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h2
                data-site-title=""
                className="font-site-heading text-site-fg mb-3.5 text-[calc(1.625rem*var(--site-heading-scale))] font-semibold tracking-[-0.01em]"
            >
                {title}
            </h2>
            {intro ? (
                <p className="text-site-body -mt-1.5 mb-5 max-w-[60ch] text-[15px] leading-relaxed">
                    {intro}
                </p>
            ) : null}
            {children}
        </section>
    );
}

/** Said where there is nothing to list: the canvas, never the live site. */
function PlansNote({
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
        <PlansFrame title={title}>
            <div
                role={action ? "alert" : "status"}
                aria-busy={busy || undefined}
                className="border-site-border text-site-body grid justify-items-start gap-2 rounded-[calc(var(--site-radius)*1.4)] border border-dashed p-5 text-sm leading-relaxed"
            >
                <p>{children}</p>
                {action ?? null}
            </div>
        </PlansFrame>
    );
}

function PlanCards({
    content,
    title,
    feed,
    prices = null,
    canvas = false,
    apiUrl,
    look,
}: {
    content: RenderedPlans;
    title: string;
    feed: PlansFeed;
    prices?: PricesActions | null;
    /** Where a checkout's return is posted (P1). */
    apiUrl?: string;
    /** Drawn in the editor: the button shows its words but goes nowhere. */
    canvas?: boolean;
    /** The site's look (DEC-172, U7); absent is Classic. */
    look?: LookId;
}) {
    // Not taking orders (#800): nothing to click that cannot work, not even
    // "Ask about joining".
    const stopped = !canvas && feed.notTakingOrders === true;
    const joins = !stopped && prices !== null && feed.payOnline === true;
    const flow = useSignInFirst(joins ? prices : null);
    const [joining, setJoining] = useState<JoinablePlan | null>(null);
    const [done, setDone] = useState<string | null>(null);
    if (feed.plans.length === 0) return null;
    const highlightFirst = content.highlight !== "none";
    const showDescriptions = content.showDescriptions !== false;
    const showPrices = content.showPrices !== false;
    // The canvas says what the live site's button will say.
    const joinWords = joins || (canvas && feed.payOnline === true);
    // Beside Join the price is the amount to pay, with its GST under it.
    const paying = joinWords;
    const label =
        said(content.buttonLabel) ?? (joinWords ? PLANS_JOIN : PLANS_BUTTON);

    function join(plan: PublicPlan) {
        setDone(null);
        flow.signedIn(
            () => setJoining(plan),
            `the customer signs in here and pays ${planPrice(plan)} to join ${plan.name}`,
        );
    }

    // Join's sheets, the same under every look.
    const sheets = joins ? (
        <>
            {flow.sheet}
            {flow.customer ? (
                <JoinSheet
                    plan={joining}
                    onClose={() => setJoining(null)}
                    businessName={prices.businessName}
                    customer={flow.customer}
                    api={prices.join}
                    apiUrl={apiUrl}
                    autopayMethods={feed.autopayMethods ?? []}
                    onJoined={(message) => {
                        setJoining(null);
                        setDone(message);
                    }}
                    onSignedOut={() => {
                        const plan = joining;
                        setJoining(null);
                        flow.signInAgain(() => setJoining(plan));
                    }}
                />
            ) : null}
        </>
    ) : null;

    // Under a look (DEC-172, U7): the look's columns, the highlighted
    // plan's Join the one filled button, and how long a member may pause
    // as the business allows it.
    if (look) {
        const pause = weeksWords(feed.pauseWeeks ?? []);
        return (
            <PriceFrame
                content={content}
                look={look}
                title={title}
                intro={said(content.intro)}
            >
                {done && prices ? (
                    <PricesDone
                        message={done}
                        accountHref={prices.accountHref}
                    />
                ) : null}
                {stopped ? <NotTakingOrders /> : null}
                <ul className={priceList(look, content.layout === "list")}>
                    {feed.plans.map((plan, index) => {
                        const highlighted = highlightFirst && index === 0;
                        const classes = priceButton(look, highlighted);
                        const primary = highlighted
                            ? { "data-site-primary": "" }
                            : {};
                        const action = canvas ? (
                            <span className={classes}>{label}</span>
                        ) : joins ? (
                            <button
                                type="button"
                                onClick={() => join(plan)}
                                aria-label={`${label}: ${plan.name}`}
                                className={classes}
                                {...primary}
                            >
                                {label}
                            </button>
                        ) : feed.joinHref && !stopped ? (
                            <a
                                href={joinHref(feed.joinHref, plan.name)}
                                aria-label={`${label}: ${plan.name}`}
                                className={classes}
                                {...primary}
                            >
                                {label}
                            </a>
                        ) : null;
                        return (
                            <li
                                key={plan.id}
                                data-plan-column=""
                                className={priceColumn(look, highlighted)}
                            >
                                <PriceParts
                                    look={look}
                                    eyebrow={planEvery(plan)}
                                    badge={
                                        highlighted && plan.mostChosen
                                            ? MOST_CHOSEN
                                            : null
                                    }
                                    name={plan.name}
                                    price={
                                        showPrices
                                            ? paying
                                                ? planPrice(plan)
                                                : planBrowsePrice(plan)
                                            : null
                                    }
                                    gst={
                                        showPrices && paying
                                            ? gstUnderWords(
                                                  plan.gst,
                                                  plan.currency,
                                              )
                                            : null
                                    }
                                    lines={[
                                        showDescriptions
                                            ? said(plan.description)
                                            : null,
                                    ]}
                                    rules={[
                                        pause ? `Pause for ${pause}` : null,
                                    ]}
                                    action={action}
                                />
                            </li>
                        );
                    })}
                </ul>
                {sheets}
            </PriceFrame>
        );
    }

    return (
        <PlansFrame title={title} intro={said(content.intro)}>
            {done && prices ? (
                <PricesDone message={done} accountHref={prices.accountHref} />
            ) : null}
            {stopped ? <NotTakingOrders /> : null}
            <ul
                className={cn(
                    "grid",
                    // "Show as" (G16): one plan per row, or side by side.
                    content.layout === "list"
                        ? "grid-cols-1 gap-2.5"
                        : "gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]",
                )}
            >
                {feed.plans.map((plan, index) => {
                    const highlighted = highlightFirst && index === 0;
                    const every = planEvery(plan);
                    const description = showDescriptions
                        ? said(plan.description)
                        : null;
                    const gstLine =
                        showPrices && paying
                            ? gstUnderWords(plan.gst, plan.currency)
                            : null;
                    return (
                        <li
                            key={plan.id}
                            className={cn(
                                "bg-site-surface text-site-fg grid min-w-0 content-start gap-1.5 overflow-hidden rounded-[calc(var(--site-radius)*1.4)] p-4",
                                highlighted
                                    ? "border-site-accent border-2"
                                    : "border-site-border border",
                            )}
                        >
                            <span className="flex min-h-[18px] items-center gap-2">
                                <span className="text-site-muted flex-1 text-[11.5px] font-bold uppercase tracking-[0.08em]">
                                    {every}
                                </span>
                                {highlighted && plan.mostChosen ? (
                                    <span className="bg-site-accent text-site-accent-fg rounded-full px-2 py-0.5 text-[11px] font-bold">
                                        {MOST_CHOSEN}
                                    </span>
                                ) : null}
                            </span>
                            <h3 className="font-site-heading text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.015em]">
                                {plan.name}
                            </h3>
                            {description ? (
                                <p className="text-site-body text-[13.5px] leading-normal [text-wrap:pretty]">
                                    {description}
                                </p>
                            ) : null}
                            <span className="mt-1.5 flex items-center gap-2.5">
                                <span className="flex-1 text-base font-bold">
                                    {showPrices
                                        ? paying
                                            ? planPrice(plan)
                                            : planBrowsePrice(plan)
                                        : null}
                                    {gstLine ? (
                                        <span
                                            data-price-gst=""
                                            className="text-site-muted block text-xs font-normal tabular-nums"
                                        >
                                            {gstLine}
                                        </span>
                                    ) : null}
                                </span>
                                {canvas ? (
                                    <span className={joinButton}>{label}</span>
                                ) : joins ? (
                                    <button
                                        type="button"
                                        onClick={() => join(plan)}
                                        aria-label={`${label}: ${plan.name}`}
                                        className={cn(
                                            joinButton,
                                            "cursor-pointer transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]",
                                            focusRing,
                                        )}
                                    >
                                        {label}
                                    </button>
                                ) : feed.joinHref && !stopped ? (
                                    <a
                                        href={joinHref(
                                            feed.joinHref,
                                            plan.name,
                                        )}
                                        aria-label={`${label}: ${plan.name}`}
                                        className={cn(
                                            joinButton,
                                            "cursor-pointer transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]",
                                            focusRing,
                                        )}
                                    >
                                        {label}
                                    </a>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {sheets}
        </PlansFrame>
    );
}
