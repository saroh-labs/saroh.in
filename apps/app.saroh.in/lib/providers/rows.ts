import { providerName } from "@/lib/payments/providers";
import type { ProviderHealth } from "@/lib/provider-health/service";

import type {
    CommsChannel,
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
    PaymentProviderName,
} from "./service";

/**
 * Settings → Providers as rows ("Saroh Settings" design): one per service
 * behind the business, each saying whether it is connected, what it is
 * called at the provider's end, who uses it, and what can be done about it.
 *
 * Built from what the page already reads — provider health, the connected
 * payment and messaging providers, the business's domains and which
 * provider each storefront's checkout charges through — and nothing else.
 * Nothing secret can reach a row: the API never sends a key, and the only
 * codes shown are ones it sends as public (a checkout's public key, a
 * sending address, a hostname).
 */

export type ProviderRowKey = "PAYMENTS" | "EMAIL" | "WHATSAPP" | "DOMAINS";

/**
 * CONNECTED — working. DISCONNECTED — someone disconnected it, so nothing
 * is being sent or taken through it. NOT_CONNECTED — never set up.
 * PENDING / FAILED — a domain's DNS check, waiting or failed.
 */
export type ProviderRowState =
    "CONNECTED" | "DISCONNECTED" | "NOT_CONNECTED" | "PENDING" | "FAILED";

/** What to call a connection's own account, so it can be found there. */
export interface ProviderRef {
    label: string;
    code: string;
}

/** Something that can be disconnected, and how the API names it. */
export type ProviderTarget =
    | { kind: "payments"; provider: PaymentProviderName }
    | { kind: "messaging"; channel: CommsChannel };

/** One connected provider under a row. */
export interface ProviderConnection {
    name: string;
    /** The provider's own dashboard — only where we know its real address. */
    manageHref: string | null;
    target: ProviderTarget;
}

/** How a row gets connected (or fixed): a setup dialog, or a page. */
export type ProviderSetup =
    | { kind: "payments" }
    | { kind: "messaging"; channel: CommsChannel }
    | { kind: "link"; href: string; label: string };

export interface ProviderRow {
    key: ProviderRowKey;
    label: string;
    note: string;
    state: ProviderRowState;
    refs: ProviderRef[];
    usedBy: string | null;
    connections: ProviderConnection[];
    setup: ProviderSetup;
    /** What stops when it is disconnected, for the confirmation. */
    consequence: string;
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

/** "A, B and C" */
function words(list: readonly string[]): string {
    if (list.length <= 1) return list[0] ?? "";
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Connected, disconnected, or never set up — from the rows' own statuses. */
function stateOf(statuses: readonly string[]): ProviderRowState {
    if (statuses.length === 0) return "NOT_CONNECTED";
    return statuses.includes("CONNECTED") ? "CONNECTED" : "DISCONNECTED";
}

/** The health row's status, for when the list behind it could not be read. */
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
}

export function buildProviderRows(input: ProviderRowsInput): ProviderRow[] {
    const rows: ProviderRow[] = [];
    for (const h of input.health) {
        if (h.key === "PAYMENTS") rows.push(paymentsRow(h, input));
        if (h.key === "COMMUNICATIONS") {
            rows.push(messagingRow("EMAIL", h, input));
            rows.push(messagingRow("WHATSAPP", h, input));
        }
        if (h.key === "DOMAINS") rows.push(domainsRow(h, input));
    }
    return rows;
}

function paymentsRow(h: ProviderHealth, input: ProviderRowsInput): ProviderRow {
    const list = input.payments;
    const state = list ? stateOf(list.map((p) => p.status)) : stateOfHealth(h);
    const live = (list ?? []).filter((p) => p.status === "CONNECTED");
    const names = live.map((p) => providerName(p.provider));
    const several = live.length > 1;

    const usedBy = live
        .map((p) => {
            const stores = input.checkout
                .filter((s) => s.provider === p.provider)
                .map((s) => s.name);
            if (stores.length === 0) return null;
            const line = `${words(stores)} checkout`;
            return several ? `${providerName(p.provider)}: ${line}` : line;
        })
        .filter((x): x is string => x !== null);

    return {
        key: "PAYMENTS",
        label: "Payments",
        note:
            state === "CONNECTED"
                ? `Card and UPI payments at checkout, through ${words(names)}.`
                : state === "DISCONNECTED"
                  ? "Disconnected — checkout can't take card or UPI payments until a provider is connected again."
                  : h.message,
        state,
        refs: live.flatMap((p) =>
            p.publicKey
                ? [
                      {
                          label: several
                              ? `${providerName(p.provider)} public key`
                              : "Public key",
                          code: p.publicKey,
                      },
                  ]
                : [],
        ),
        usedBy: usedBy.length > 0 ? `Used by ${usedBy.join(" · ")}` : null,
        connections: live.map((p) => ({
            name: providerName(p.provider),
            manageHref: dashboardFor(p.provider),
            target: { kind: "payments", provider: p.provider },
        })),
        setup: { kind: "payments" },
        consequence:
            "Checkout stops taking card and UPI payments through it straight away. Orders already paid are not affected. Connecting again means entering the keys again — they cannot be read back.",
    };
}

const CHANNEL = {
    EMAIL: {
        label: "Email",
        purpose: "Email to your customers and leads",
        noun: "email",
    },
    WHATSAPP: {
        label: "WhatsApp",
        purpose: "WhatsApp messages to your customers and leads",
        noun: "WhatsApp messages",
    },
} as const;

function messagingRow(
    channel: CommsChannel,
    h: ProviderHealth,
    input: ProviderRowsInput,
): ProviderRow {
    const spec = CHANNEL[channel];
    const list = input.messaging?.filter((c) => c.channel === channel) ?? null;
    // Without the list, the health row speaks for both channels at once, so
    // it can only say a channel is not connected — never claim one is.
    const state = list
        ? stateOf(list.map((c) => c.status))
        : stateOfHealth(h) === "CONNECTED"
          ? "NOT_CONNECTED"
          : stateOfHealth(h);
    const live = (list ?? []).filter((c) => c.status === "CONNECTED");
    const names = live.map((c) => commsProviderName(c.provider));

    return {
        key: channel,
        label: spec.label,
        note:
            state === "CONNECTED"
                ? `${spec.purpose}, sent through ${words(names)}.`
                : state === "DISCONNECTED"
                  ? `Disconnected — ${spec.noun} aren't sent until a provider is connected again.`
                  : `Connect a provider to send ${spec.noun}.`,
        state,
        refs: live.flatMap((c) =>
            c.fromAddress ? [{ label: "Sends from", code: c.fromAddress }] : [],
        ),
        usedBy: null,
        connections: live.map((c) => ({
            name: commsProviderName(c.provider),
            manageHref: dashboardFor(c.provider),
            target: { kind: "messaging", channel },
        })),
        setup: { kind: "messaging", channel },
        consequence: `${spec.label === "Email" ? "Email stops" : "WhatsApp messages stop"} being sent straight away; ones already sent are not affected. Connecting again means entering the keys again — they cannot be read back.`,
    };
}

const DOMAIN_STATUS: Record<string, string> = {
    VERIFIED: "Verified",
    PENDING: "Waiting for DNS",
    FAILED: "DNS check failed",
};

function domainsRow(h: ProviderHealth, input: ProviderRowsInput): ProviderRow {
    const state = stateOfHealth(h);
    return {
        key: "DOMAINS",
        label: "Domains",
        note: h.message,
        state,
        refs: (input.domains ?? []).map((d) => ({
            label: DOMAIN_STATUS[d.status] ?? d.status,
            code: d.hostname,
        })),
        usedBy: null,
        // A domain belongs to a site and is removed there, with its DNS
        // record beside it — not disconnected from here.
        connections: [],
        setup: {
            kind: "link",
            href: h.actionHref,
            // Shown only while it is not connected; a verified domain needs
            // nothing from this page.
            label: state === "NOT_CONNECTED" ? "Add a domain" : "Check DNS",
        },
        consequence: "",
    };
}
