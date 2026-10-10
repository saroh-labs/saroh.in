"use server";

import {
    createQrCode as createQrCodeApi,
    retireQrCode as retireQrCodeApi,
    updateQrCode as updateQrCodeApi,
} from "./service";
import type { QrCodeChange, QrCodeInput } from "./types";

/**
 * Server Actions for a site's QR codes. Thin: the API resolves the caller
 * from the session, checks `site:update`, the target, the colour and the
 * plan, and its refusal comes back as the result for the screen to word.
 */

export async function createQrCode(siteId: string, input: QrCodeInput) {
    return createQrCodeApi(siteId, input);
}

export async function updateQrCode(
    siteId: string,
    qrCodeId: string,
    change: QrCodeChange,
) {
    return updateQrCodeApi(siteId, qrCodeId, change);
}

export async function retireQrCode(siteId: string, qrCodeId: string) {
    return retireQrCodeApi(siteId, qrCodeId);
}
