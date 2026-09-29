import { providerName } from "@/lib/payments/providers";
import type { ProviderHealth } from "@/lib/provider-health/service";

import type {
    CommsChannel,
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
    PaymentProviderName,
    PaymentWebhookSetup,
} from "./service";
import { lastUpdateLine, webhookFor } from "./webhook";

/**
 * Settings → Providers as rows: one per provider, not one per kind of
 * service. The providers the business has connected come first — including
 * one someone disconnected, which is still theirs and says so — and the ones
 * it could connect next follow. Domains are not a provider and keep a row of
 * their own below.
 *
 * Built from what the page already reads — provider health, the connected
 * payment and messaging providers, the business's domains and which
 * provider each storefront's checkout charges through — and nothing else.
 * Nothing secret can reach a row: the API never sends a key, and the only
 * codes shown are ones it sends as public (a checkout's public key, a
 * sending address, a hostname).
 */

/**
 * CONNECTED — working. ATTENTION — connected, but missing something it
 * needs to work (a Razorpay connection without its public key id, or
 * without its webhook signing secret, DEC-063).
 * DISCONNECTED — someone disconnected it, so nothing is being sent or taken
 * through it. NOT_CONNECTED — never set up. PENDING / FAILED — a domain's
 * DNS check, waiting or failed.
 */
export type ProviderRowState =
    | "CONNECTED"
    | "ATTENTION"
    | "DISCONNECTED"
    | "NOT_CONNECTED"
    | "PENDING"
    | "FAILED";

/** What to call a connection's own account, so it can be found there. */
export interface ProviderRef {
    label: string;
    code: string;
}

/** Something that can be disconnected, and how the API names it. */
export type ProviderTarget =
    | { kind: "payments"; provider: PaymentProviderName }
    | { kind: "messaging"; channel: CommsChannel };

/** Which setup dialog connects a provider, opened on that provider. */
export type ProviderSetup =
    | { kind: "payments"; provider: PaymentProviderName }
    | { kind: "messaging"; channel: CommsChannel; provider: string };

/** What a provider does for the business, as its row names it. */
export type ProviderType = "Payments" | "Email" | "WhatsApp";

/** One provider: connected (or once connected), or one that could be. */
export interface ProviderEntry {
    /** Unique on the page: "payments:CASHFREE", "EMAIL:RESEND". */
    key: string;
    name: string;
    type: ProviderType;
    state: "CONNECTED" | "ATTENTION" | "DISCONNECTED" | "NOT_CONNECTED";
    /** What it does for the business; empty for one not connected. */
    note: string;
    /**
     * The one fix a connection needing attention asks for, as its button
     * ("Add key id", "Add webhook secret"); `null` otherwise.
     */
    fix: string | null;
    /**
     * A connected payment provider's webhook, in words: when a payment
     * update last arrived, or that none has yet (DEC-063). `null` when
     * there is nothing true to say.
     */
    update: string | null;
    refs: ProviderRef[];
    /** The provider's own dashboard — only while connected, and only where we know its real address. */
    manageHref: string | null;
    /** What Disconnect takes away — only while connected. */
    target: ProviderTarget | null;
    setup: ProviderSetup;
    /** What stops when it is disconnected, for the confirmation. */
    consequence: string;
}

/** The business's domains, which are added and fixed under Sites. */
export interface DomainsRow {
    label: string;
    note: string;
    state: ProviderRowState;
    refs: ProviderRef[];
    setup: { href: string; label: string };
}

export interface ProvidersView {
    connected: ProviderEntry[];
    available: ProviderEntry[];
    /**
     * The kinds of provider whose list could not be read. Nothing is said
     * about them either way — not connected, not available — so the page
     * can say what it could not find out.
     */
    unread: ("payments" | "messaging")[];
    /** `null` when the business has no module that uses a domain. */
    domains: DomainsRow | null;
    /** Whether any module that uses a provider is on at all. */
    any: boolean;
}

/**
 * The provider's own dashboard, by the key the API stores. A provider not
 * here (an SMTP relay has no dashboard of ours to point at) gets no Manage
 * button rather than a guess.
 */
const DASHBOARD: Record<string, string> = {
    RAZORPAY: "https://dashboard.razorpay.com",
    CASHFREE: "https://merchant.cashfree.com",
    STRIPE: "https://dashboard.stripe.com",
    RESEND: "https://resend.com/emails",
    SENDGRID: "https://app.sendgrid.com",
    TWILIO: "https://console.twilio.com",
    META: "https://business.facebook.com/wa/manage/home/",
};

export function dashboardFor(provider: string): string | null {
    return DASHBOARD[provider.toUpperCase()] ?? null;
}

const COMMS_NAME: Record<string, string> = {
    RESEND: "Resend",
    SENDGRID: "SendGrid",
    SMTP: "SMTP relay",
    META: "Meta (WhatsApp Cloud)",
    TWILIO: "Twilio",
};

export function commsProviderName(provider: string): string {
    return COMMS_NAME[provider.toUpperCase()] ?? providerName(provider);
}

/**
 * What the API can actually connect — its `SUPPORTED_PROVIDERS` for
 * payments and the adapters registered per channel for messaging. Stripe
 * and Dodo Payments are in the database's list of providers but the API
 * has no way to connect either, so offering them would be a Connect button
 * that fails.
 */
export const CONNECTABLE_PAYMENTS: readonly PaymentProviderName[] = [
    "RAZORPAY",
    "CASHFREE",
];
export const CONNECTABLE_COMMS: Record<CommsChannel, readonly string[]> = {
    EMAIL: ["RESEND", "SENDGRID", "SMTP"],
    WHATSAPP: ["META", "TWILIO"],
};

/** "A, B and C" */
function words(list: readonly string[]): string {
    if (list.length <= 1) return list[0] ?? "";
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Ends it with one full stop — a storefront may be called "Rye & Co." */
function sentence(text: string): string {
    return text.endsWith(".") ? text : `${text}.`;
}

/** The health row's status, for the domains row. */
function stateOfHealth(health: ProviderHealth | undefined): ProviderRowState {
    switch (health?.status) {
        case "ACTIVE":
            return "CONNECTED";
        case "DEGRADED":
            return "DISCONNECTED";
        case "PENDING":
            return "PENDING";
        case "FAILED":
            return "FAILED";
        default:
            return "NOT_CONNECTED";
    }
}

export interface ProviderRowsInput {
    health: ProviderHealth[];
    payments: ConnectedPaymentProvider[] | null;
    messaging: ConnectedCommsProvider[] | null;
    /** The business's own domains; `null` when they could not be read. */
    domains: { hostname: string; status: string }[] | null;
    /** Each storefront, and the provider its checkout really charges through. */
    checkout: { name: string; provider: string | null }[];
    /** Each payment provider's webhook; `null` or absent when unread. */
    webhooks?: PaymentWebhookSetup[] | null;
    /** For "2 min ago"; the time of the read by default. */
    now?: Date;
}

/**
 * A Razorpay key id, test or live — the same check the API makes
 * (`payments/public-key.ts`), so setup can say what's wrong before saving.
 */
export const RAZORPAY_KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]+$/;

/**
 * A connected Razorpay account without its public key id (DEC-054): its
 * checkout window can't open, so the API takes no online payment through
 * it. Setup stores the key id as the public key since D22, and a backfill
 * filled every older connection it could read; one left over needs its keys
 * entered again.
 */
export function needsPublicKey(p: ConnectedPaymentProvider): boolean {
    return (
        p.provider === "RAZORPAY" &&
        p.status === "CONNECTED" &&
        !p.publicKey?.trim()
    );
}

/**
 * A connected Razorpay account saved without its webhook signing secret
 * (DEC-063): every payment update it sends is refused, so a customer who
 * paid stays "Awaiting payment". Setup requires it since then; one saved
 * before needs its keys entered again with the secret.
 */
export function needsWebhookSecret(p: ConnectedPaymentProvider): boolean {
    return p.status === "CONNECTED" && p.webhookSecretMissing === true;
}

const PAYMENTS_CONSEQUENCE =
    "Checkout stops taking online payments through it straight away. Orders already paid are not affected. Connecting again means entering the keys again — they cannot be read back.";

export function buildProvidersView(input: ProviderRowsInput): ProvidersView {
    const has = (key: ProviderHealth["key"]) =>
        input.health.find((h) => h.key === key);
    const view: ProvidersView = {
        connected: [],
        available: [],
        unread: [],
        domains: null,
        any: input.health.length > 0,
    };

    // Each kind appears only while a module that uses it is on — the
    // health read lists exactly those.
    if (has("PAYMENTS")) {
        if (input.payments) {
            for (const p of input.payments) {
                view.connected.push(paymentEntry(p, input));
            }
            for (const provider of CONNECTABLE_PAYMENTS) {
                if (input.payments.some((p) => p.provider === provider))
                    continue;
                view.available.push(availablePayment(provider));
            }
        } else view.unread.push("payments");
    }

    if (has("COMMUNICATIONS")) {
        if (input.messaging) {
            for (const channel of ["EMAIL", "WHATSAPP"] as const) {
                const own = input.messaging.filter(
                    (c) => c.channel === channel,
                );
                for (const c of own) view.connected.push(commsEntry(c));
                // A channel sends through one provider at a time: while one
                // is connected, another would replace it, which is its row's
                // Change keys — not a second Connect beside it.
                if (own.some((c) => c.status === "CONNECTED")) continue;
                for (const provider of CONNECTABLE_COMMS[channel]) {
                    if (own.some((c) => c.provider === provider)) continue;
                    view.available.push(availableComms(channel, provider));
                }
            }
        } else view.unread.push("messaging");
    }

    const domains = has("DOMAINS");
    if (domains) view.domains = domainsRow(domains, input);
    return view;
}

function paymentEntry(
    p: ConnectedPaymentProvider,
    input: ProviderRowsInput,
): ProviderEntry {
    const live = p.status === "CONNECTED";
    const noKey = needsPublicKey(p);
    const noSecret = needsWebhookSecret(p);
    const attention = noKey || noSecret;
    // The storefronts whose checkout really charges through it.
    const stores = input.checkout
        .filter((s) => s.provider === p.provider)
        .map((s) => s.name);
    return {
        key: `payments:${p.provider}`,
        name: providerName(p.provider),
        type: "Payments",
        state: attention ? "ATTENTION" : live ? "CONNECTED" : "DISCONNECTED",
        note: !live
            ? "Disconnected — checkout can't take online payments through it until it is connected again."
            : noKey
              ? "Needs its key id — checkout can't open the payment window, so no one can pay online through it until you enter the keys again."
              : noSecret
                ? "Needs its webhook signing secret — payments can't be confirmed until you add it."
                : stores.length > 0
                  ? sentence(`Takes online payments at ${words(stores)}`)
                  : "Ready to take online payments — no storefront's checkout uses it yet.",
        fix: noKey ? "Add key id" : noSecret ? "Add webhook secret" : null,
        update: live
            ? lastUpdateLine(
                  webhookFor(input.webhooks, p.provider),
                  input.now ?? new Date(),
              )
            : null,
        refs:
            live && p.publicKey?.trim()
                ? [{ label: "Public key", code: p.publicKey.trim() }]
                : [],
        manageHref: live ? dashboardFor(p.provider) : null,
        target: live ? { kind: "payments", provider: p.provider } : null,
        setup: { kind: "payments", provider: p.provider },
        consequence: PAYMENTS_CONSEQUENCE,
    };
}

function availablePayment(provider: PaymentProviderName): ProviderEntry {
    return {
        key: `payments:${provider}`,
        name: providerName(provider),
        type: "Payments",
        state: "NOT_CONNECTED",
        note: "",
        fix: null,
        update: null,
        refs: [],
        manageHref: null,
        target: null,
        setup: { kind: "payments", provider },
        consequence: PAYMENTS_CONSEQUENCE,
    };
}

const CHANNEL = {
    EMAIL: {
        type: "Email",
        purpose: "Email to your customers and leads.",
        stopped:
            "Disconnected — email isn't sent until a provider is connected again.",
        consequence:
            "Email stops being sent straight away; ones already sent are not affected. Connecting again means entering the keys again — they cannot be read back.",
    },
    WHATSAPP: {
        type: "WhatsApp",
        purpose: "WhatsApp messages to your customers and leads.",
        stopped:
            "Disconnected — WhatsApp messages aren't sent until a provider is connected again.",
        consequence:
            "WhatsApp messages stop being sent straight away; ones already sent are not affected. Connecting again means entering the keys again — they cannot be read back.",
    },
} as const;

function commsEntry(c: ConnectedCommsProvider): ProviderEntry {
    const spec = CHANNEL[c.channel];
    const live = c.status === "CONNECTED";
    return {
        key: `${c.channel}:${c.provider}`,
        name: commsProviderName(c.provider),
        type: spec.type,
        state: live ? "CONNECTED" : "DISCONNECTED",
        note: live ? spec.purpose : spec.stopped,
        fix: null,
        update: null,
        refs:
            live && c.fromAddress
                ? [{ label: "Sends from", code: c.fromAddress }]
                : [],
        manageHref: live ? dashboardFor(c.provider) : null,
        target: live ? { kind: "messaging", channel: c.channel } : null,
        setup: { kind: "messaging", channel: c.channel, provider: c.provider },
        consequence: spec.consequence,
    };
}

function availableComms(
    channel: CommsChannel,
    provider: string,
): ProviderEntry {
    const spec = CHANNEL[channel];
    return {
        key: `${channel}:${provider}`,
        name: commsProviderName(provider),
        type: spec.type,
        state: "NOT_CONNECTED",
        note: "",
        fix: null,
        update: null,
        refs: [],
        manageHref: null,
        target: null,
        setup: { kind: "messaging", channel, provider },
        consequence: spec.consequence,
    };
}

const DOMAIN_STATUS: Record<string, string> = {
    VERIFIED: "Verified",
    PENDING: "Waiting for DNS",
    FAILED: "DNS check failed",
};

function domainsRow(h: ProviderHealth, input: ProviderRowsInput): DomainsRow {
    const state = stateOfHealth(h);
    const verified = (input.domains ?? []).filter(
        (d) => d.status === "VERIFIED",
    );
    return {
        label: "Domains",
        // What it does once it works; until then, the API's own next step.
        note:
            state !== "CONNECTED"
                ? h.message
                : verified.length === 1
                  ? `Points ${verified[0].hostname} at your site.`
                  : "Points your domains at your sites.",
        state,
        refs: (input.domains ?? []).map((d) => ({
            label: DOMAIN_STATUS[d.status] ?? d.status,
            code: d.hostname,
        })),
        // A domain belongs to a site and is added, checked and removed
        // there, with its DNS record beside it — not from here. Shown only
        // while it is not connected; a verified domain needs nothing here.
        setup: {
            href: h.actionHref,
            label: state === "NOT_CONNECTED" ? "Add a domain" : "Check DNS",
        },
    };
}
