import type { CrmResult } from "@/lib/api/http";
import { destroy, getJson, mutate, orgBase } from "@/lib/api/http";

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
    updatedAt: string;
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
