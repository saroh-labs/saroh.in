"use server";

import { disconnectAiConnection as disconnect } from "./service";

/** Disconnect: the API lets anyone end their own, and the Owner anyone's. */
export async function disconnectAiConnection(id: string) {
    return disconnect(id);
}
