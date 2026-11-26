"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect } from "react";

import { seedRead } from "@/lib/query/seed";
import type { ShellLive, ShellSettings } from "@/lib/shell/queries";
import { shellLiveRead, shellSettingsRead } from "@/lib/shell/queries";

/**
 * What the layout read for the shell on a full load, still on its way
 * (owner, 25 Nov 2026): the same answers `/api/shell` and `/api/shell/live`
 * give, streamed later in the document's own response. `null` = the read
 * failed; the route is asked instead.
 */
export interface ShellSeedData {
    settings: Promise<ShellSettings | null>;
    live: Promise<ShellLive | null>;
}

/**
 * Fills the shell's two queries from the layout's promises, so the rail,
 * the bell and the banners subscribe to a read already under way and ask
 * no route (React Query joins a read in flight). Keyed by the business,
 * like every key: a switch never clears another business's.
 */
export function ShellSeed({
    orgId,
    seed,
}: {
    orgId: string;
    seed: ShellSeedData;
}) {
    const client = useQueryClient();
    // After hydration's commit, before the readers subscribe (their reads
    // start in passive effects): seeded during render, an answer landing
    // mid-hydration would draw what the server's HTML didn't (#418).
    useLayoutEffect(() => {
        seedRead(client, shellSettingsRead, orgId, {}, seed.settings);
        seedRead(client, shellLiveRead, orgId, {}, seed.live);
    }, [client, orgId, seed]);
    return null;
}
