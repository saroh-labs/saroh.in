"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import type {
    CommsChannel,
    ConnectCommsInput,
    ConnectPaymentInput,
    PaymentProviderName,
    StripeCheckoutStyle,
} from "./service";
import {
    connectCommsProvider as connectCommsApi,
    connectPaymentProvider as connectPaymentApi,
    disconnectCommsProvider as disconnectCommsApi,
    disconnectPaymentProvider as disconnectPaymentApi,
    setStripeCheckoutStyle as setStripeCheckoutStyleApi,
} from "./service";

/**
 * Server Actions for providers: thin wrappers that forward the session to
 * api.saroh.in, which enforces who may manage them and seals the secrets.
 * From Settings › Integrations on React Query each takes the tab's business
 * last (`writeAsOrg`): refused when another business is open, nothing
 * revalidated.
 */

/** The write as the tab's business, or as before without one. */
function asOrg<R>(orgId: string | undefined, write: () => Promise<R>) {
    return orgId ? writeAsOrg(orgId, write) : write();
}
export async function connectPaymentProvider(
    input: ConnectPaymentInput,
    orgId?: string,
) {
    return asOrg(orgId, () => connectPaymentApi(input));
}

export async function disconnectPaymentProvider(
    provider: PaymentProviderName,
    orgId?: string,
) {
    return asOrg(orgId, () => disconnectPaymentApi(provider));
}

export async function setStripeCheckoutStyle(
    checkoutStyle: StripeCheckoutStyle,
    orgId?: string,
) {
    return asOrg(orgId, () => setStripeCheckoutStyleApi(checkoutStyle));
}

export async function connectCommsProvider(
    input: ConnectCommsInput,
    orgId?: string,
) {
    return asOrg(orgId, () => connectCommsApi(input));
}

export async function disconnectCommsProvider(
    channel: CommsChannel,
    orgId?: string,
) {
    return asOrg(orgId, () => disconnectCommsApi(channel));
}
