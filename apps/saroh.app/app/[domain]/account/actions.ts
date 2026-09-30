"use server";

import type {
    CodeRequestResult,
    SignedInCustomer,
    SignInOptions,
    VerifyResult,
} from "@saroh/site-blocks";

import {
    accountFetch,
    clearSessionCookie,
    setSessionCookie,
    siteAccountsFetch,
} from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";
import {
    codeCallFailed,
    codeResult,
    customerFromEmail,
    getSignInOptions,
    sessionAnswer,
} from "@/lib/sign-in";
import { testMode } from "@/lib/test-release";

/**
 * Signing in on a merchant's site (ADR-011; round-2 plan A, A3): ask for a
 * code, trade it for a session, sign out. The sign-in sheet calls these;
 * each runs on this server so the session stays in a host-only cookie and
 * every API call carries the signed relay.
 *
 * Every action checks `Origin` first (`siteOrigin`), before anything is
 * sent: `lib/origin.test.ts` fails when one doesn't.
 */

const MAX_EMAIL = 254;

function cleanEmail(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const email = value.trim();
    return email && email.length <= MAX_EMAIL ? email : null;
}

export async function requestSignInCode(
    email: string,
    challenge?: string,
): Promise<CodeRequestResult> {
    if (!(await siteOrigin())) return { ok: false, reason: "error" };
    if (await testMode()) return { ok: false, reason: "test-release" };
    const address = cleanEmail(email);
    if (!address) return { ok: false, reason: "email" };
    const call = await siteAccountsFetch("codes", {
        method: "POST",
        body:
            typeof challenge === "string" && challenge
                ? { email: address, challenge: challenge.slice(0, 2_048) }
                : { email: address },
    });
    if (!call.ok) return codeCallFailed(call.reason);
    return codeResult(call.res.status, await call.res.json().catch(() => null));
}

export async function verifySignInCode(
    email: string,
    code: string,
): Promise<VerifyResult> {
    if (!(await siteOrigin())) return { ok: false, reason: "error" };
    if (await testMode()) return { ok: false, reason: "test-release" };
    const address = cleanEmail(email);
    const digits = typeof code === "string" ? code.replace(/\D/g, "") : "";
    if (!address || digits.length !== 6) {
        return { ok: false, reason: "invalid" };
    }
    const call = await siteAccountsFetch("sessions", {
        method: "POST",
        body: { email: address, code: digits },
    });
    if (!call.ok) return { ok: false, reason: "error" };
    const answer = sessionAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
    );
    if (!answer.ok) return answer;

    await setSessionCookie(answer.token);
    return { ok: true, customer: await whoIs(answer.token, address) };
}

/** The customer a brand-new session belongs to, for "Welcome, ‹name›". */
async function whoIs(token: string, email: string): Promise<SignedInCustomer> {
    const call = await siteAccountsFetch("session", { session: token });
    if (call.ok && call.res.ok) {
        const body = (await call.res.json().catch(() => null)) as {
            email?: unknown;
            name?: unknown;
        } | null;
        if (typeof body?.email === "string") {
            return {
                email: body.email,
                name: typeof body.name === "string" ? body.name : null,
            };
        }
    }
    return customerFromEmail(email);
}

/**
 * What the sign-in sheet needs up front, read when the header's "Sign in"
 * is pressed (A5) rather than on every page view. Null when the API can't
 * say; the sheet then goes without the phone line.
 */
export async function loadSignInOptions(): Promise<SignInOptions | null> {
    if (!(await siteOrigin())) return null;
    return getSignInOptions().catch(() => null);
}

export async function signOut(): Promise<{ ok: boolean }> {
    if (!(await siteOrigin())) return { ok: false };
    if (await testMode()) return { ok: false };
    await accountFetch("session", { method: "DELETE" });
    await clearSessionCookie();
    return { ok: true };
}

export async function signOutEverywhere(): Promise<{ ok: boolean }> {
    if (!(await siteOrigin())) return { ok: false };
    if (await testMode()) return { ok: false };
    const call = await accountFetch("sessions", { method: "DELETE" });
    await clearSessionCookie();
    return { ok: call?.ok === true && call.res.ok };
}
