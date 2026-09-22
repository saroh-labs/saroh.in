"use server";

import type {
    CommsChannel,
    ConnectCommsInput,
    ConnectPaymentInput,
    PaymentProviderName,
} from "./service";
import {
    connectCommsProvider as connectCommsApi,
    connectPaymentProvider as connectPaymentApi,
    disconnectCommsProvider as disconnectCommsApi,
    disconnectPaymentProvider as disconnectPaymentApi,
} from "./service";

/**
 * Server Actions for providers: thin wrappers that forward the session to
 * api.saroh.in, which enforces who may manage them and seals the secrets.
 */
export async function connectPaymentProvider(input: ConnectPaymentInput) {
    return connectPaymentApi(input);
}

export async function disconnectPaymentProvider(provider: PaymentProviderName) {
    return disconnectPaymentApi(provider);
}

export async function connectCommsProvider(input: ConnectCommsInput) {
    return connectCommsApi(input);
}

export async function disconnectCommsProvider(channel: CommsChannel) {
    return disconnectCommsApi(channel);
}
