"use server";

import { mutate } from "@/lib/api/http";

/**
 * Tell the API an upgrade prompt was shown or pressed (#1197, DEC-187). The
 * API decides the plan offered and whether "shown" counts today, and
 * refuses a key or action that isn't its own (a server action is a public
 * endpoint), so both only travel encoded.
 */
export async function recordUpgradePrompt(
    key: string,
    action: string,
): Promise<void> {
    await mutate(
        `/upgrade-prompts/${encodeURIComponent(key)}/${encodeURIComponent(action)}`,
        "POST",
        {},
        "",
    );
}
