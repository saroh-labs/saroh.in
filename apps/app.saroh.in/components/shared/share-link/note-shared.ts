"use client";

import { markMomentSeen } from "@/lib/moments/actions";

/**
 * The booking page or shop link was copied or shared: Home's "Share your
 * booking link" is done (#1194). Fire and forget: the copy already took,
 * and a mark that fails only leaves the step to tick next time.
 */
export function noteShared(): Promise<unknown> {
    return markMomentSeen("shared-booking-link").catch(() => null);
}
