"use server";

import {
    disconnectAiConnection as disconnect,
    readAiActivity as read,
    rollBackAiSiteDraft as rollBack,
} from "./service";

/** Disconnect: the API lets anyone end their own, and the Owner anyone's. */
export async function disconnectAiConnection(id: string) {
    return disconnect(id);
}

/** A read: what the connection changed, when its sheet opens or for more. */
export async function readAiActivity(id: string, cursor?: string) {
    return read(id, cursor);
}

/** Draft only; refused when the draft changed outside the connection since. */
export async function rollBackAiSiteDraft(id: string, siteId: string) {
    return rollBack(id, siteId);
}
