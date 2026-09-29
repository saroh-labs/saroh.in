"use client";

import { useCallback, useEffect, useState } from "react";

import type { RenderedPlans } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import type { AutopayMethod } from "../autopay/api";
import { autopayMethodsOf } from "../autopay/api";
import { cn } from "../lib/utils";
import type { PricesActions } from "../prices/api";
import { PricesDone, useSignInFirst } from "../prices/flow";
import type { JoinablePlan } from "../prices/join-sheet";
import { JoinSheet } from "../prices/join-sheet";
import { planEvery, planPrice } from "../prices/plan-words";
import { askAboutHref } from "../shop/ask-about-ordering";

/**
 * `plans` v1 — the business's subscription plans on sale, read live (G9).
 *
 * The section stores a title, a highlight, a button label and one switch.
 * The plans come from `GET public/sites/:siteId/plans`, which serves only
 * plans on sale with their PUBLISHED values (never a draft or an unpublished
 * change) and 404s while Payments is off for the business. Two ways in:
 *
 * - **`feed`** — handed in by the page that serves the site (live or behind
 *   a preview token), read on the server. No plans (none on sale, Payments
 *   off, the read failed): the block renders NOTHING.
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
 * Drawn from `--site-*` only; gates G2 and G7 fail the build otherwise.
 */

/** A plan as the public plans read serves it. */
export interface PublicPlan {
    id: string;
    name: string;
    description: string | null;
    /** A decimal string, e.g. "1200.00". */
    price: string;
    currency: string;
    /** WEEK | MONTH | QUARTER | YEAR */
    interval: string;
    /** The one plan more current members are on than any other. */
    mostChosen: boolean;
}

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
}

/** What the section is called when the merchant left the title empty. */
export const PLANS_TITLE = "Plans";

/** The button's words when the merchant left them empty. */
export const PLANS_BUTTON = "Ask about joining";

/** The button's words where the customer can join online (G20). */
export const PLANS_JOIN = "Join";

/** The badge on a highlighted plan that more members chose than any other. */
export const MOST_CHOSEN = "Most chosen";

export function isPublicPlan(value: unknown): value is PublicPlan {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        (v.description === null || typeof v.description === "string") &&
        typeof v.price === "string" &&
        typeof v.currency === "string" &&
        typeof v.interval === "string" &&
        typeof v.mostChosen === "boolean"
    );
}

/** The plans in a read's body, narrowed rather than cast (#264); else null. */
export function plansOf(body: unknown): PublicPlan[] | null {
    const rows = (body as { plans?: unknown } | null)?.plans;
    if (!Array.isArray(rows)) return null;
    return rows.filter(isPublicPlan);
}

/** Whether a read says Join works (G20); an older API that doesn't say: no. */
export function plansPayOnline(body: unknown): boolean {
    return (body as { payOnline?: unknown } | null)?.payOnline === true;
}

/** The autopay methods the plans read names (D12); none when it names none. */
export function plansAutopayMethods(body: unknown): AutopayMethod[] {
    return autopayMethodsOf(
        (body as { autopayMethods?: unknown } | null)?.autopayMethods,
    );
}

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
    | { kind: "error" };

export default function PlansSection({
    content,
    feed,
    prices = null,
    siteId,
    apiUrl = DEFAULT_API_URL,
}: {
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
                We couldn&apos;t load your plans just now.
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
    if (state.plans.length === 0) {
        return (
            <PlansNote title={title}>
                No plans on sale yet. Publish a plan and it shows here; until
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
const joinButton =
    "inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-[var(--site-radius)] bg-site-accent px-3.5 text-[13.5px] font-bold text-site-accent-fg";

function PlansFrame({
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
}: {
    content: RenderedPlans;
    title: string;
    feed: PlansFeed;
    prices?: PricesActions | null;
    /** Drawn in the editor: the button shows its words but goes nowhere. */
    canvas?: boolean;
}) {
    const joins = prices !== null && feed.payOnline === true;
    const flow = useSignInFirst(joins ? prices : null);
    const [joining, setJoining] = useState<JoinablePlan | null>(null);
    const [done, setDone] = useState<string | null>(null);
    if (feed.plans.length === 0) return null;
    const highlightFirst = content.highlight !== "none";
    const showDescriptions = content.showDescriptions !== false;
    const showPrices = content.showPrices !== false;
    // The canvas says what the live site's button will say.
    const joinWords = joins || (canvas && feed.payOnline === true);
    const label =
        said(content.buttonLabel) ?? (joinWords ? PLANS_JOIN : PLANS_BUTTON);

    function join(plan: PublicPlan) {
        setDone(null);
        flow.signedIn(() => setJoining(plan));
    }

    return (
        <PlansFrame title={title}>
            {done && prices ? (
                <PricesDone message={done} accountHref={prices.accountHref} />
            ) : null}
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
                                    {showPrices ? planPrice(plan) : null}
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
                                ) : feed.joinHref ? (
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
            {joins ? (
                <>
                    {flow.sheet}
                    {flow.customer ? (
                        <JoinSheet
                            plan={joining}
                            onClose={() => setJoining(null)}
                            businessName={prices.businessName}
                            customer={flow.customer}
                            api={prices.join}
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
            ) : null}
        </PlansFrame>
    );
}
