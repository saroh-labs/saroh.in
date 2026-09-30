"use server";

import type {
    AccountCancelAnswer,
    AccountMoveAnswer,
    AccountTimesAnswer,
    AccountVisitAnswer,
} from "@saroh/site-blocks";

import { accountAreaOn } from "@/lib/account-area";
import {
    cancelResult,
    isBookingRow,
    isTreatment,
    timesResult,
} from "@/lib/account-bookings-shape";
import { refusalMessage } from "@/lib/account-shape";
import { accountFetch } from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";
import { testMode } from "@/lib/test-release";
import { TEST_RELEASE_REFUSAL } from "@saroh/site-blocks";

/**
 * What a signed-in customer changes in their Bookings (round-2 plan A, A6):
 * the free times to move to, a move, a cancel, and a treatment's next
 * visit. Each runs on this server with the session cookie and the signed
 * relay, and checks `Origin` first (`lib/origin.test.ts` fails when one
 * doesn't). The API's own words reach the customer only where they were
 * written for them: its 409s ("Call ‹business› to change this", "That time
 * just went") and a field's 400 (`refusalMessage`).
 */

const OFFLINE = "We couldn't reach the business. Try again in a moment.";
const MAX_REF = 64;
const GONE = "We couldn't find that booking in your account.";

function cleanRef(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const ref = value.trim();
    return ref && ref.length <= MAX_REF ? encodeURIComponent(ref) : null;
}

function cleanInstant(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const at = new Date(value);
    return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

type Call = Awaited<ReturnType<typeof accountFetch>>;

async function answer<T>(
    call: Call,
    read: (body: unknown) => T | null,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    if (!call?.ok) return { ok: false, message: OFFLINE };
    const body: unknown = await call.res.json().catch(() => null);
    if (call.res.ok) {
        const value = read(body);
        return value === null
            ? { ok: false, message: OFFLINE }
            : { ok: true, value };
    }
    if (call.res.status === 404) return { ok: false, message: GONE };
    return { ok: false, message: refusal(call.res.status, body) };
}

/**
 * The API's words when they were written for the customer: a 409's, a
 * field's 400 ("Bookings open 21 days ahead. Pick an earlier date."), or
 * the page's own sentence.
 */
function refusal(status: number, body: unknown): string {
    const said = refusalMessage(status, body, "");
    if (said) return said;
    const error =
        typeof body === "object" && body !== null
            ? (body as { error?: { message?: unknown } }).error
            : undefined;
    if (status === 400 && typeof error?.message === "string") {
        const message = error.message.trim();
        if (message) return message;
    }
    return OFFLINE;
}

export async function moveTimes(ref: string): Promise<AccountTimesAnswer> {
    if (!(await siteOrigin()) || !accountAreaOn()) {
        return { ok: false, message: OFFLINE };
    }
    const id = cleanRef(ref);
    if (!id) return { ok: false, message: OFFLINE };
    const got = await answer(
        await accountFetch(`me/bookings/${id}/times`),
        timesResult,
    );
    return got.ok ? { ok: true, times: got.value } : got;
}

export async function moveBooking(
    ref: string,
    startAt: string,
): Promise<AccountMoveAnswer> {
    if (!(await siteOrigin()) || !accountAreaOn()) {
        return { ok: false, message: OFFLINE };
    }
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    const id = cleanRef(ref);
    const at = cleanInstant(startAt);
    if (!id || !at) return { ok: false, message: OFFLINE };
    const got = await answer(
        await accountFetch(`me/bookings/${id}/move`, {
            method: "POST",
            body: { startAt: at },
        }),
        (body) => (isBookingRow(body) ? body : null),
    );
    // The business is told of it (A14): only when the API says so.
    return got.ok
        ? {
              ok: true,
              booking: got.value,
              told: (got.value as { told?: unknown }).told === true,
          }
        : got;
}

export async function cancelBooking(ref: string): Promise<AccountCancelAnswer> {
    if (!(await siteOrigin()) || !accountAreaOn()) {
        return { ok: false, message: OFFLINE };
    }
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    const id = cleanRef(ref);
    if (!id) return { ok: false, message: OFFLINE };
    const got = await answer(
        await accountFetch(`me/bookings/${id}/cancel`, { method: "POST" }),
        cancelResult,
    );
    return got.ok ? { ok: true, result: got.value } : got;
}

export async function visitTimes(
    orderRef: string,
): Promise<AccountTimesAnswer> {
    if (!(await siteOrigin()) || !accountAreaOn()) {
        return { ok: false, message: OFFLINE };
    }
    const id = cleanRef(orderRef);
    if (!id) return { ok: false, message: OFFLINE };
    const got = await answer(
        await accountFetch(`me/treatments/${id}/times`),
        timesResult,
    );
    return got.ok ? { ok: true, times: got.value } : got;
}

export async function bookVisit(
    orderRef: string,
    startAt: string,
): Promise<AccountVisitAnswer> {
    if (!(await siteOrigin()) || !accountAreaOn()) {
        return { ok: false, message: OFFLINE };
    }
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    const id = cleanRef(orderRef);
    const at = cleanInstant(startAt);
    if (!id || !at) return { ok: false, message: OFFLINE };
    const got = await answer(
        await accountFetch(`me/treatments/${id}/visits`, {
            method: "POST",
            body: { startAt: at },
        }),
        (body) => (isTreatment(body) ? body : null),
    );
    return got.ok ? { ok: true, treatment: got.value } : got;
}
