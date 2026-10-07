/**
 * Typed registry of known feature-flag keys.
 *
 * Callers reference flags through `FlagKey.ORG_AUTHORIZATION` rather than raw
 * strings, so a typo is a compile error and the set of live flags is
 * discoverable in one place. The string values are the persisted `key` on the
 * FeatureFlag / FeatureFlagOverride rows.
 */
export const FlagKey = {
    /** Stage 1 org-authorization switch (ADR-001). */
    ORG_AUTHORIZATION: "ORG_AUTHORIZATION",

    /**
     * Per-module Saroh-side rollout switches (ADR-003). These are the *rollout*
     * gate only — the emergency/gradual kill switch Saroh controls — and are
     * deliberately distinct from an Organization *enabling* a module (an
     * installation record) and from *entitlement* (commercial rights). A module
     * is available only when its rollout flag is on AND the Organization has
     * enabled it AND entitlement AND authorization all pass. Default false, so
     * modules dark-roll out (see the modular-capabilities plan, Task 9).
     */
    MODULE_WEBSITE: "MODULE_WEBSITE",
    MODULE_CRM: "MODULE_CRM",
    MODULE_APPOINTMENTS: "MODULE_APPOINTMENTS",
    MODULE_COURSES: "MODULE_COURSES",
    /**
     * Class packs became their own module in round 2 (E12, default 44). The
     * `class-packs-module` backfill registers this flag with Appointments'
     * value, so no business that sold packs under Appointments loses them.
     */
    MODULE_CLASS_PACKS: "MODULE_CLASS_PACKS",
    MODULE_COMMERCE: "MODULE_COMMERCE",
    MODULE_PAYMENTS: "MODULE_PAYMENTS",
    MODULE_COMMUNICATIONS: "MODULE_COMMUNICATIONS",
    MODULE_AUTOMATIONS: "MODULE_AUTOMATIONS",
    MODULE_INSIGHTS: "MODULE_INSIGHTS",

    /**
     * The public shop on merchant sites (round-2 G11): `/shop`, the product
     * pages, the Product grid's live reads and the "Sells from" setting.
     * Off hides all of it. It stays off until the bag and checkout (G13)
     * ship, so no product page goes live without a way to order.
     */
    SITE_SHOP: "SITE_SHOP",

    /**
     * Posting to a customer's account thread (round-2 D17, then F4's Reply).
     * The thread is A13's, so this stays off until A13 is live in
     * production; with it off, sending an invoice offers email alone and
     * never the thread. Read in `communications/account-thread.ts`.
     */
    ACCOUNT_THREAD: "ACCOUNT_THREAD",

    /**
     * Autopay through a business's Razorpay account (round-2 D19). The
     * adapter can set up, charge and cancel mandates, but a business is
     * offered autopay through Razorpay only while this is on. It stays off
     * in production until a Razorpay test-mode run has authorised a
     * mandate and settled a charge (waves plan, boundary 6). Reading,
     * charging and cancelling a mandate already made never wait on it.
     */
    RAZORPAY_AUTOPAY: "RAZORPAY_AUTOPAY",

    /**
     * Pay links on the business's own address (DEC-069, R9): off, every
     * pay link is `saroh.app/pay/…` as before; on, `<its site>/pay/…`
     * (`invoices/pay-link-url.ts`, `payLinkUrlFor`). It goes on only once
     * the renderer serves `/pay` on a tenant host (plan L6) in production.
     */
    PAY_LINK_ON_SITE: "PAY_LINK_ON_SITE",

    /**
     * Test releases (DEC-071): making, sharing and going live with a frozen
     * version of a site, and serving it on its test host. Per business, off
     * by default. Its seven readers, once the plan's units land: the release
     * endpoints (404 when off), the test-host lookup (404 when off, so it is
     * also the host's kill switch), the scheduled go-live endpoint, the
     * "Website goes live" row in each person's alerts (T10), the editor's
     * Test releases panel, the "Publishing needs approval" settings row, and
     * the API turning that setting on (409 when off, T9: with no releases,
     * nothing but an owner's override could go live). A go-live already
     * scheduled still runs with it off.
     * Deleted with those readers one release after it is on for everyone.
     */
    SITE_TEST_RELEASES: "SITE_TEST_RELEASES",

    /**
     * Changing a business's web address (DEC-069, plan L2): off, the owner
     * can't change it (`PUT organizations/:id/web-address` answers 403) and
     * Settings shows no Change button. Two readers: that endpoint, and the
     * read's `canChange` (`organizations/web-address.service.ts`). It goes
     * on only once the renderer forwards an old address (plan L3) in
     * production, first for one business, then for everyone.
     */
    WEB_ADDRESS_CHANGE: "WEB_ADDRESS_CHANGE",

    /**
     * The plans catalogue's kill switch (OQ-4): on, a module the business's
     * plan doesn't include is unavailable (module availability's plan gate,
     * U12), and the catalogue's limits and locks are enforced and its limit
     * notices sent (`MeteringService`, U13). Off, the catalogue still
     * answers every read (`GET …/billing/access` with its usage, the limits
     * `EntitlementService` has always enforced) but locks nothing new.
     * Readers: module availability, `MeteringService` (every metered write
     * and switch) and the `plan.limit.notice` handler.
     */
    PLAN_ENFORCEMENT: "PLAN_ENFORCEMENT",

    /**
     * Saroh sends a business's booking emails while it has no email
     * provider of its own (DEC-086): confirmed, moved and cancelled, from
     * `bookings@notify.saroh.in`, counted against the plan's
     * `sarohEmailsPerMonth`. Per business, off by default; the env's
     * `SAROH_BUSINESS_EMAIL_STOP` overrides it for everyone. Readers, all
     * through `communications/saroh-may-send.ts`: the notify handler and
     * `queueTransactional` (whether Saroh sends), notice reach (what the
     * workspace says), and `message.send` (a queued send re-checks it).
     * Deleted once the route is on for every business for a release.
     */
    SAROH_BUSINESS_EMAIL: "SAROH_BUSINESS_EMAIL",
} as const;

export type FlagKey = (typeof FlagKey)[keyof typeof FlagKey];

/** All registered flag keys, for iteration / validation. */
export const FLAG_KEYS: FlagKey[] = Object.values(FlagKey);

const KEY_SET: ReadonlySet<string> = new Set(FLAG_KEYS);

/** True when `key` is a known, registered flag key. */
export function isKnownFlagKey(key: string): key is FlagKey {
    return KEY_SET.has(key);
}

/**
 * What each flag is for, who owns it, and when it should go (admin console
 * U10, R16). A flag is a debt: it forks behaviour until someone removes it.
 * Every registered key must say why it exists and by when it will be
 * reviewed for deletion — `flags.spec.ts` fails a key that does not, so a
 * flag cannot be added without a plan to take it away.
 */
export interface FlagMetadata {
    /** What turning it on does, in a sentence an operator can act on. */
    purpose: string;
    /** Who decides when it changes — a role, not a person. */
    owner: string;
    /** ISO date by which it is reviewed for deletion. */
    reviewBy: string;
    /** What has to be true before it can be deleted. */
    removeWhen: string;
}

const MODULE_ROLLOUT = (label: string): FlagMetadata => ({
    purpose: `Makes the ${label} module available to a business that has switched it on. Off hides it everywhere, whatever the business chose.`,
    owner: "Release manager",
    reviewBy: "2027-03-31",
    removeWhen: `${label} is on for every business on every instance and has needed no kill switch for a release.`,
});

export const FLAG_METADATA: Record<FlagKey, FlagMetadata> = {
    ORG_AUTHORIZATION: {
        purpose:
            "Authorizes a store's staff through the business's own roles (ADR-001). Off keeps the older per-store owner and staff checks.",
        owner: "Platform owner",
        reviewBy: "2026-12-31",
        removeWhen:
            "Every instance runs with it on and the fallback path has been deleted from the code.",
    },
    MODULE_WEBSITE: MODULE_ROLLOUT("Website"),
    MODULE_CRM: MODULE_ROLLOUT("CRM"),
    MODULE_APPOINTMENTS: MODULE_ROLLOUT("Appointments"),
    MODULE_COURSES: MODULE_ROLLOUT("Courses"),
    MODULE_CLASS_PACKS: MODULE_ROLLOUT("Class packs"),
    MODULE_COMMERCE: MODULE_ROLLOUT("Commerce"),
    MODULE_PAYMENTS: MODULE_ROLLOUT("Payments"),
    MODULE_COMMUNICATIONS: MODULE_ROLLOUT("Communications"),
    MODULE_AUTOMATIONS: MODULE_ROLLOUT("Automations"),
    MODULE_INSIGHTS: MODULE_ROLLOUT("Insights"),
    SITE_SHOP: {
        purpose:
            "Opens the shop on a business's website: /shop, product pages and the Sells from setting. Turn it on only once the bag and checkout (G13) have shipped; off hides the shop everywhere.",
        owner: "Release manager",
        reviewBy: "2027-01-31",
        removeWhen:
            "The bag and checkout are live, the shop is on for every business on every instance, and it has needed no kill switch for a release.",
    },
    ACCOUNT_THREAD: {
        purpose:
            "Lets Saroh post to a customer's account thread on the business's site: an invoice sent or reminded about, and later Home's Reply. Turn it on only once the message thread (A13) and its notify job (A14) are live in production; off, invoices go by email alone.",
        owner: "Release manager",
        reviewBy: "2027-01-31",
        removeWhen:
            "The account thread is live on every instance and has needed no kill switch for a release.",
    },
    RAZORPAY_AUTOPAY: {
        purpose:
            "Offers autopay (UPI Autopay, card or bank eMandate) to the customers of a business that takes payments through Razorpay. Turn it on only after a Razorpay test-mode run has authorised a mandate and settled one charge; off, no autopay is set up or charged through Razorpay (renewals are invoiced with a pay link, as before autopay), while mandates already made can still be cancelled.",
        owner: "Release manager",
        reviewBy: "2027-01-31",
        removeWhen:
            "Razorpay autopay has run in production on every instance for a release and has needed no kill switch.",
    },
    PAY_LINK_ON_SITE: {
        purpose:
            "Issues pay links on the business's own web address (its custom domain, else its saroh.app address) instead of saroh.app/pay. Turn it on only after the renderer serves pay pages on a business's address in production; off, every link is on saroh.app, and links already sent keep working either way.",
        owner: "Release manager",
        reviewBy: "2027-01-31",
        removeWhen:
            "It has been on for every business on every instance for a release, and the apex-only link functions have been removed.",
    },
    SITE_TEST_RELEASES: {
        purpose:
            "Lets a business make test releases of its website: a frozen version on a test address, shared by link, that it can then put live now or at a set time, and the Publishing needs approval setting. Off hides all of it and the test address answers not found; a go-live already scheduled still runs. Turn it on only once the API that keeps test releases out of version history has been live for a release.",
        owner: "Release manager",
        reviewBy: "2027-03-31",
        removeWhen:
            "Test releases are on for every business on every instance, have needed no kill switch for a release, and the flag's seven readers (release endpoints, test-host lookup, scheduling, the Website alert row, the editor panel, the settings row and the setting's own write) have been removed.",
    },
    PLAN_ENFORCEMENT: {
        purpose:
            "Applies the plans catalogue: a module the business's plan doesn't include is unavailable, and the plan's limits are enforced. Turn it on only after the grandfather backfill has run on that instance; off, nothing new is locked or refused (the kill switch).",
        owner: "Release manager",
        reviewBy: "2027-06-30",
        removeWhen:
            "The catalogue has been enforced for every business on every instance for a release with no need to switch it off, and its readers no longer ask it.",
    },
    SAROH_BUSINESS_EMAIL: {
        purpose:
            "Lets Saroh email a business's booking confirmations, moves and cancellations from its own notify address while the business has no email provider connected, counted against the plan's monthly allowance. Turn it on for one business first, only once the notify subdomain is verified in SES and the plan versions carry the allowance; off, those customers are told in their account alone, as before. SAROH_BUSINESS_EMAIL_STOP on the API stops it for everyone at once.",
        owner: "Release manager",
        reviewBy: "2027-03-31",
        removeWhen:
            "Saroh's booking emails have been on for every business on every instance for a release with no need to switch them off, and the four readers in saroh-may-send.ts no longer ask it.",
    },
    WEB_ADDRESS_CHANGE: {
        purpose:
            "Lets a business's owner change its web address in Settings; the old address forwards for 90 days and stays held for the business. Turn it on only once the renderer forwards an old address in production, first for one business; off, the address can't be changed and no Change button shows.",
        owner: "Release manager",
        reviewBy: "2027-03-31",
        removeWhen:
            "Changing the address has been on for every business on every instance for a release, and its two readers (the change endpoint and the read's canChange) no longer ask it.",
    },
};
