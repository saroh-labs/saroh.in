import type { CrmResult } from "@/lib/api/http";
import { apiFetch, destroy, getJson, mutate, orgBase } from "@/lib/api/http";

/**
 * The business's own payment and messaging providers: which are connected,
 * connecting one, and disconnecting it. Secrets go IN only — the API seals
 * them and never returns them, so nothing here can read one back.
 */

export type PaymentProviderName = "RAZORPAY" | "CASHFREE";

export interface ConnectedPaymentProvider {
    id: string;
    provider: PaymentProviderName;
    status: string;
    publicKey: string | null;
    /**
     * Saved without the webhook signing secret its provider signs with, so
     * no payment through it can be confirmed (DEC-063). Absent from an API
     * older than that rule: read as not missing.
     */
    webhookSecretMissing?: boolean;
    updatedAt: string;
}

/** A provider's webhook for this business, as setup shows it (DEC-063). */
export interface PaymentWebhookSetup {
    provider: PaymentProviderName;
    /** Where the provider sends payment updates for this business; null when the server has no public address set. */
    url: string | null;
    /** What to tick in the provider's dashboard. */
    events: string[];
    /** Whether setup asks for a signing secret of its own (Razorpay). */
    secretRequired: boolean;
    /** When a verified payment update last arrived; `null`, never. */
    lastReceivedAt: string | null;
}

export interface ConnectPaymentInput {
    provider: PaymentProviderName;
    keyId: string;
    keySecret: string;
    publicKey?: string;
    webhookSecret?: string;
}

export type CommsChannel = "EMAIL" | "WHATSAPP";

export interface ConnectedCommsProvider {
    id: string;
    channel: CommsChannel;
    provider: string;
    status: string;
    fromAddress: string | null;
    updatedAt: string;
}

export interface ConnectCommsInput {
    channel: CommsChannel;
    provider: string;
    fromAddress?: string;
    credentials: Record<string, string>;
}

export async function listPaymentProviders(): Promise<
    ConnectedPaymentProvider[] | null
> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<ConnectedPaymentProvider[]>(`${base}/payment-providers`);
}

/**
 * Each payment provider's webhook for this business (DEC-063). `null` when
 * it couldn't be read — setup then says so rather than show no address.
 */
export async function listPaymentWebhooks(): Promise<
    PaymentWebhookSetup[] | null
> {
    const base = await orgBase();
    if (!base) return null;
    // Best-effort, and never a denial: the page reads it only for someone
    // the provider-health read already let in, so a refusal or a failure
    // here only costs the address and the last-update line.
    const res = await apiFetch(`${base}/payment-providers/webhooks`);
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as PaymentWebhookSetup[] | null;
}

/**
 * Saroh sending the business's booking emails while it has no email of its
 * own (DEC-086), as the API works it out from the rule the send follows.
 * OFF says nothing new; `takesOver` (its own email connected) says
 * disconnecting it would hand booking emails to Saroh.
 */
export type SarohEmailState =
    | { state: "OFF"; takesOver: boolean }
    | {
          state: "SENDING" | "NEAR" | "PAUSED";
          used: number;
          cap: number;
          /** The day the business's month starts again: "1 Nov". */
          resetsOn: string;
          sender: { name: string; address: string };
          /** Where customers' replies go; null without a clean contact email. */
          replyTo: string | null;
      }
    | { state: "UNREAD" };

const SAROH_EMAIL_OFF: SarohEmailState = { state: "OFF", takesOver: false };

/**
 * Whether Saroh sends the business's booking emails, and how much of the
 * month's allowance is used. Never throws and never reads a failure as a
 * zero: a failed read is UNREAD. An API without the read (404) says
 * nothing new — OFF.
 */
export async function getSarohEmail(): Promise<SarohEmailState> {
    const base = await orgBase();
    if (!base) return { state: "UNREAD" };
    const res = await apiFetch(`${base}/comms-providers/saroh-email`).catch(
        () => null,
    );
    if (res?.status === 404) return SAROH_EMAIL_OFF;
    if (!res?.ok) return { state: "UNREAD" };
    const body: unknown = await res.json().catch(() => null);
    return isSarohEmailState(body) ? body : { state: "UNREAD" };
}

/** Only a body shaped as one of the states is read; anything else is UNREAD. */
function isSarohEmailState(body: unknown): body is SarohEmailState {
    if (typeof body !== "object" || body === null) return false;
    const b = body as Record<string, unknown>;
    switch (b.state) {
        case "OFF":
            return typeof b.takesOver === "boolean";
        case "UNREAD":
            return true;
        case "SENDING":
        case "NEAR":
        case "PAUSED": {
            const sender = b.sender as Record<string, unknown> | null;
            return (
                typeof b.used === "number" &&
                typeof b.cap === "number" &&
                typeof b.resetsOn === "string" &&
                typeof sender === "object" &&
                sender !== null &&
                typeof sender.name === "string" &&
                typeof sender.address === "string" &&
                (b.replyTo === null || typeof b.replyTo === "string")
            );
        }
        default:
            return false;
    }
}

export async function listCommsProviders(): Promise<
    ConnectedCommsProvider[] | null
> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<ConnectedCommsProvider[]>(`${base}/comms-providers`);
}

export function connectPaymentProvider(
    input: ConnectPaymentInput,
): Promise<CrmResult<ConnectedPaymentProvider>> {
    return mutate<ConnectedPaymentProvider>(
        "/payment-providers",
        "POST",
        input,
        "Could not connect the payment provider",
    );
}

export function disconnectPaymentProvider(
    provider: PaymentProviderName,
): Promise<CrmResult<{ id: string }>> {
    return destroy<{ id: string }>(
        `/payment-providers/${provider}`,
        "Could not disconnect the payment provider",
    );
}

export function connectCommsProvider(
    input: ConnectCommsInput,
): Promise<CrmResult<ConnectedCommsProvider>> {
    return mutate<ConnectedCommsProvider>(
        "/comms-providers",
        "POST",
        input,
        "Could not connect the messaging provider",
    );
}

export function disconnectCommsProvider(
    channel: CommsChannel,
): Promise<CrmResult<{ id: string }>> {
    return destroy<{ id: string }>(
        `/comms-providers/${channel}`,
        "Could not disconnect the messaging provider",
    );
}
