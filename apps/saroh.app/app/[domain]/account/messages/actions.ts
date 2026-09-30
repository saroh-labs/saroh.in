"use server";

import type { SendResult } from "@saroh/site-blocks";

import { accountAreaOn } from "@/lib/account-area";
import { isMessage, refusalMessage } from "@/lib/account-shape";
import { accountFetch } from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";
import { testMode } from "@/lib/test-release";
import { TEST_RELEASE_REFUSAL } from "@saroh/site-blocks";

/**
 * Writing to the business from the customer's account (round-2 A13). Runs
 * on this server with the session cookie and the signed relay, and checks
 * `Origin` first (`lib/origin.test.ts` fails when an action doesn't). The
 * API's own words reach the customer only where they were written for them
 * (`refusalMessage`: a field's message, or the too-many sentence).
 */

const OFFLINE = "We couldn't reach the business. Try again in a moment.";
const SIGNED_OUT = "You've been signed out. Sign in again to send it.";
/** The API's cap (`MESSAGE_MAX` in site-accounts/thread-store.ts). */
const MAX_MESSAGE = 2_000;

export async function sendMessage(text: string): Promise<SendResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    const body = typeof text === "string" ? text.trim() : "";
    if (!body) return { ok: false, message: "Write your message" };
    if (body.length > MAX_MESSAGE) {
        return { ok: false, message: "Keep it to 2,000 characters" };
    }
    const call = await accountFetch("me/messages", {
        method: "POST",
        body: { text: body },
    });
    if (!call) return { ok: false, message: SIGNED_OUT };
    if (!call.ok) return { ok: false, message: OFFLINE };
    const answer: unknown = await call.res.json().catch(() => null);
    if (call.res.ok && isMessage(answer)) return { ok: true, message: answer };
    if (call.res.status === 401) return { ok: false, message: SIGNED_OUT };
    return {
        ok: false,
        message: refusalMessage(call.res.status, answer, OFFLINE),
    };
}
