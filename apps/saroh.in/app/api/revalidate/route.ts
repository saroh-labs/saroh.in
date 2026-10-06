import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { env } from "@/env";
import {
    REVALIDATE_HEADER,
    REVALIDATE_PATHS,
    secretMatches,
} from "@/lib/revalidate";

/**
 * `POST /api/revalidate` — the API's call after a pricing version is
 * published or goes live (plans catalogue U24, KTD-10).
 *
 * - POST only (anything else is a 405 from Next).
 * - The secret (`PRICING_REVALIDATE_SECRET`) in the `x-saroh-revalidate`
 *   header, compared in constant time; a missing or wrong one is a 401.
 * - No path parameter: the body and query are ignored and the fixed list in
 *   `lib/revalidate.ts` is refreshed.
 */
export const dynamic = "force-dynamic";

let warnedNoSecret = false;

export function POST(req: Request) {
    const secret = env.PRICING_REVALIDATE_SECRET;
    if (!secret && !warnedNoSecret) {
        warnedNoSecret = true;
        console.error(
            "[revalidate] PRICING_REVALIDATE_SECRET is not set; refusing every call",
        );
    }
    if (!secretMatches(req.headers.get(REVALIDATE_HEADER), secret)) {
        return NextResponse.json(
            { revalidated: false },
            { status: 401, headers: { "Cache-Control": "no-store" } },
        );
    }
    for (const { path, type } of REVALIDATE_PATHS) {
        revalidatePath(path, type);
    }
    return NextResponse.json(
        { revalidated: true, paths: REVALIDATE_PATHS.map((p) => p.path) },
        { headers: { "Cache-Control": "no-store" } },
    );
}
