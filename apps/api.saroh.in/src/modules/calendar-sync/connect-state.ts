import { randomBytes, timingSafeEqual } from "node:crypto";

import { keyedDigest, keyedDigests } from "../../common/crypto";
import { calendarKey, withCalendarKey } from "./sealing";

/**
 * The `state` the Google consent carries there and back (#1047): which
 * business and which person started it, a nonce, and when it stops being
 * good (10 minutes). Signed with a keyed digest under `CALENDAR_ENC_KEY`
 * (any key on the ring opens it), so nobody can make one up, and the
 * callback refuses one for anyone but the person signed in.
 */

export const STATE_TTL_MS = 10 * 60_000;
const LABEL = "google-calendar-consent-state";
const MAX_LENGTH = 1_000;

export interface ConnectState {
    organizationId: string;
    membershipId: string;
    userId: string;
    nonce: string;
    expiresAt: number;
}

interface Payload {
    o: string;
    m: string;
    u: string;
    n: string;
    e: number;
}

export function signState(
    who: Pick<ConnectState, "organizationId" | "membershipId" | "userId">,
    now: Date = new Date(),
): string {
    const payload: Payload = {
        o: who.organizationId,
        m: who.membershipId,
        u: who.userId,
        n: randomBytes(12).toString("base64url"),
        e: now.getTime() + STATE_TTL_MS,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = withCalendarKey((key) => keyedDigest(body, LABEL, key));
    return `${body}.${sig}`;
}

/** Why a state was refused, for the redirect back to the app. */
export type StateRefusal = "invalid" | "expired";

/**
 * What a good state names, or why it is refused: tampered, made up or
 * malformed is `invalid`; past its 10 minutes is `expired`.
 */
export function verifyState(
    state: unknown,
    now: Date = new Date(),
): ConnectState | StateRefusal {
    if (typeof state !== "string" || state.length > MAX_LENGTH) {
        return "invalid";
    }
    const parts = state.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return "invalid";
    const [body, sig] = parts;
    const known = withCalendarKey(() =>
        keyedDigests(body, LABEL, calendarKey()),
    );
    if (!known.some((digest) => same(digest, sig))) return "invalid";
    let p: Partial<Payload>;
    try {
        p = JSON.parse(
            Buffer.from(body, "base64url").toString("utf8"),
        ) as Partial<Payload>;
    } catch {
        return "invalid";
    }
    if (
        typeof p.o !== "string" ||
        typeof p.m !== "string" ||
        typeof p.u !== "string" ||
        typeof p.n !== "string" ||
        typeof p.e !== "number"
    ) {
        return "invalid";
    }
    if (p.e <= now.getTime()) return "expired";
    return {
        organizationId: p.o,
        membershipId: p.m,
        userId: p.u,
        nonce: p.n,
        expiresAt: p.e,
    };
}

function same(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}
