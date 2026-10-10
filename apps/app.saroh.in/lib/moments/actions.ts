"use server";

import type { MomentKey } from "./keys";
import { MOMENT_KEYS } from "./keys";
import { markMomentSeen as markMomentSeenApi } from "./service";

/**
 * Put a moment away for the whole business (wave G). A thin wrapper, as
 * everywhere else: the API decides who may. Nothing is revalidated: the
 * card has already left the screen it was on, and the next read of any
 * screen asks the API again.
 */
export async function markMomentSeen(key: MomentKey) {
    // A server action is a public endpoint: the key is checked here too.
    if (!(MOMENT_KEYS as readonly string[]).includes(key)) {
        return { ok: false as const, error: "Couldn't put that away." };
    }
    return markMomentSeenApi(key);
}
