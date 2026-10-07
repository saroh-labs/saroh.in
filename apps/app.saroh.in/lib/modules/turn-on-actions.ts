"use server";

import { revalidatePath } from "next/cache";

import type { ConnectLocks } from "@/lib/providers/connect-lock";
import { connectLocksOf } from "@/lib/providers/connect-lock";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

import type { SetupDefaults } from "./turn-on-schema";
import type { EnableResult } from "./turn-on-service";
import { enableModule, getSetupDefaults } from "./turn-on-service";

/**
 * Server Actions for the "Turn on" sheet (DEC-068). The sheet reads what to
 * start from when it opens, then turns each module on in order.
 */

/** The defaults for each module the sheet may ask about, read together. */
export async function readSetupDefaultsAction(
    keys: string[],
): Promise<SetupDefaults[]> {
    return Promise.all(
        Array.from(new Set(keys)).map((k) => getSetupDefaults(k)),
    );
}

/**
 * Turn one module on with its setup. The rail, Home and every module's
 * screens change with it, so the whole layout is read again.
 */
export async function enableModuleAction(
    key: string,
    setup: object,
): Promise<EnableResult> {
    const result = await enableModule(key, setup);
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

/**
 * What the plan won't let the business connect (DEC-091, UX-006), so the
 * sheet says it in place of "Connect now" rather than send the merchant to
 * a key form the API refuses. Best-effort: unread locks nothing.
 */
export async function readConnectLocksAction(): Promise<ConnectLocks> {
    return connectLocksOf(await billingAccessOrNull().catch(() => null));
}
