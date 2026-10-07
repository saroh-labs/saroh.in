import type { SignedInBookRequest } from "@saroh/site-blocks";

/**
 * The body the signed-in booking sends the API (round-2 plan A, A9), built
 * from what the page asked for — an allow-list, since a server action's
 * arguments come from the browser. Null when the request isn't one the
 * page makes. The API checks every field again; this only keeps anything
 * else from being forwarded.
 *
 * There is never an email or an amount: the booker is the account's and
 * the price is the service's. A phone is passed on only when it looks like
 * one (UX-049); the API keeps it on the booking and gives it to the
 * account's record only when that has none.
 */
export type AccountBookingBody = SignedInBookRequest;

const MAX_ID = 64;
const MAX_KEY = 128;
const MAX_NAME = 128;
const MAX_NOTE = 1_000;
/** A phone as people type one: digits, spaces, +, -, brackets. */
const PHONE = /^\+?[\d\s()-]{6,24}$/;

function text(value: unknown, max: number): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= max ? trimmed : undefined;
}

export function accountBookingBody(
    request: unknown,
): AccountBookingBody | null {
    if (!request || typeof request !== "object") return null;
    const r = request as Record<string, unknown>;
    const serviceId = text(r.serviceId, MAX_ID);
    const startAt = text(r.startAt, 40);
    const idempotencyKey = text(r.idempotencyKey, MAX_KEY);
    if (!serviceId || !startAt || !idempotencyKey) return null;
    // A deposit (E8) is one of the page's ways to pay; its amount is the
    // server's. A credit (A10) names the pack or the membership it was
    // offered, one of them — the API checks it is theirs.
    if (
        r.pay !== "NOW" &&
        r.pay !== "DEPOSIT" &&
        r.pay !== "DESK" &&
        r.pay !== "CREDIT"
    ) {
        return null;
    }
    const packPurchaseId = text(r.packPurchaseId, MAX_ID);
    const subscriptionId = text(r.subscriptionId, MAX_ID);
    if (r.pay === "CREDIT" && !packPurchaseId === !subscriptionId) {
        return null;
    }
    if (
        r.locationType !== undefined &&
        r.locationType !== "IN_PERSON" &&
        r.locationType !== "ONLINE"
    ) {
        return null;
    }
    const body: AccountBookingBody = {
        serviceId,
        startAt,
        idempotencyKey,
        pay: r.pay,
    };
    if (r.pay === "CREDIT") {
        if (packPurchaseId) body.packPurchaseId = packPurchaseId;
        if (subscriptionId) body.subscriptionId = subscriptionId;
    }
    const staffId = text(r.staffId, MAX_ID);
    if (staffId) body.staffId = staffId;
    const bookerName = text(r.bookerName, MAX_NAME);
    if (bookerName) body.bookerName = bookerName;
    if (r.locationType) body.locationType = r.locationType;
    // A note is kept as written (the API trims it); past its length, the
    // API's own sentence says so.
    if (typeof r.intakeNote === "string" && r.intakeNote.trim()) {
        body.intakeNote = r.intakeNote.slice(0, MAX_NOTE + 1);
    }
    const bookerPhone = text(r.bookerPhone, 24);
    if (bookerPhone && PHONE.test(bookerPhone)) body.bookerPhone = bookerPhone;
    return body;
}
