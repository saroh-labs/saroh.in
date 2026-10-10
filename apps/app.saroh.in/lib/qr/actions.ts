"use server";

import type { QrPanelRead, QrSavedLink } from "./panel";
import { panelCodeInput } from "./panel";
import { readQrPanel } from "./panel-read";
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

/**
 * What a QR button's panel shows for a saved link: the code its target
 * already has, and whether this person may make one. A read; it never
 * writes, so opening a panel makes nothing.
 */
export async function openQrPanel(
    want: Pick<QrSavedLink, "kind" | "ref" | "siteId" | "from">,
): Promise<QrPanelRead> {
    return readQrPanel(want);
}

/** "Make this code" in a QR button's panel: a plain code for its target. */
export async function makeQrPanelCode(
    siteId: string,
    want: Pick<QrSavedLink, "kind" | "ref" | "from">,
) {
    return createQrCodeApi(siteId, panelCodeInput(want));
}
