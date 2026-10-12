"use server";

import type {
    CodeRequestResult,
    DetailsResult,
    NoteResult,
    NoticesResult,
    PayNowResult,
    VerifyResult,
} from "@saroh/site-blocks";

import { accountAreaOn } from "@/lib/account-area";
import { noticesResult } from "@/lib/account-details-shape";
import {
    emailChangeAnswer,
    isAccountView,
    isNote,
    payNowAnswer,
    refusalMessage,
} from "@/lib/account-shape";
import { accountFetch } from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";
import { codeCallFailed, codeResult, customerFromEmail } from "@/lib/sign-in";
import { testMode } from "@/lib/test-release";
import { TEST_RELEASE_REFUSAL } from "@saroh/site-blocks";

/**
 * What a signed-in customer changes in Me (round-2 plan A, A5): their name
 * and phone, their sign-in email (a code to the new address), and a health
 * note for the team; and, since DEC-142, "Pay now" on an open invoice and
 * whether the business may email them. Each runs on this server with the session cookie and
 * the signed relay, and checks `Origin` first (`lib/origin.test.ts` fails
 * when one doesn't). The API's own words reach the customer only where they
 * were written for them (a field's message, `refusalMessage`).
 */

const OFFLINE = "We couldn't reach the business. Try again in a moment.";
const MAX_EMAIL = 254;
const MAX_NOTE = 500;

/** Me's details sheet: a name, and a phone (empty clears it). */
interface DetailsInput {
    name: string;
    phone: string;
}

export async function updateAccountDetails(
    input: DetailsInput,
): Promise<DetailsResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    if (!name) return { ok: false, message: "Enter your name" };
    const call = await accountFetch("me", {
        method: "PATCH",
        body: { name: name.slice(0, 128), phone: phone.slice(0, 20) },
    });
    if (!call?.ok) return { ok: false, message: OFFLINE };
    const body: unknown = await call.res.json().catch(() => null);
    if (call.res.ok && isAccountView(body)) return { ok: true, account: body };
    return {
        ok: false,
        message: refusalMessage(call.res.status, body, OFFLINE),
    };
}

export async function requestEmailChangeCode(
    email: string,
    challenge?: string,
): Promise<CodeRequestResult> {
    if (!(await siteOrigin())) return { ok: false, reason: "error" };
    if (await testMode()) return { ok: false, reason: "test-release" };
    if (!accountAreaOn()) return { ok: false, reason: "error" };
    const address = typeof email === "string" ? email.trim() : "";
    if (!address || address.length > MAX_EMAIL) {
        return { ok: false, reason: "email" };
    }
    const call = await accountFetch("me/email/code", {
        method: "POST",
        body:
            typeof challenge === "string" && challenge
                ? { email: address, challenge: challenge.slice(0, 2_048) }
                : { email: address },
    });
    if (!call) return { ok: false, reason: "error" };
    if (!call.ok) return codeCallFailed(call.reason);
    return codeResult(call.res.status, await call.res.json().catch(() => null));
}

export async function confirmEmailChange(
    email: string,
    code: string,
): Promise<VerifyResult> {
    if (!(await siteOrigin())) return { ok: false, reason: "error" };
    if (await testMode()) return { ok: false, reason: "test-release" };
    if (!accountAreaOn()) return { ok: false, reason: "error" };
    const address = typeof email === "string" ? email.trim() : "";
    const digits = typeof code === "string" ? code.replace(/\D/g, "") : "";
    if (!address || address.length > MAX_EMAIL || digits.length !== 6) {
        return { ok: false, reason: "invalid" };
    }
    const call = await accountFetch("me/email", {
        method: "POST",
        body: { email: address, code: digits },
    });
    if (!call?.ok) return { ok: false, reason: "error" };
    const answer = emailChangeAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
    );
    if (!answer.ok) return answer;
    // The answer is the same whatever happened: read who is signed in now.
    const now = await accountFetch("session");
    if (now?.ok && now.res.ok) {
        const body = (await now.res.json().catch(() => null)) as {
            email?: unknown;
            name?: unknown;
        } | null;
        if (typeof body?.email === "string") {
            return {
                ok: true,
                customer: {
                    email: body.email,
                    name: typeof body.name === "string" ? body.name : null,
                },
            };
        }
    }
    return { ok: true, customer: customerFromEmail(address) };
}

export async function addHealthNote(text: string): Promise<NoteResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    const note = typeof text === "string" ? text.trim() : "";
    if (!note) return { ok: false, message: "Write your note" };
    const call = await accountFetch("me/notes", {
        method: "POST",
        body: { text: note.slice(0, MAX_NOTE) },
    });
    if (!call?.ok) return { ok: false, message: OFFLINE };
    const body: unknown = await call.res.json().catch(() => null);
    if (call.res.ok && isNote(body)) return { ok: true, note: body };
    return {
        ok: false,
        message: refusalMessage(call.res.status, body, OFFLINE),
    };
}

/** An invoice's ref is an opaque id: letters, digits, `_` and `-`. */
const REF = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * "Pay now" on one of the customer's open invoices (DEC-142): the API makes
 * a pay link that moment, for an invoice it finds by its ref **and** the
 * signed-in customer, and this answers only ever with a pay page's address
 * (`payNowAnswer`). An invoice that is paid, gone or someone else's is a
 * 404 there, said here as its own sentence.
 */
export async function payInvoiceNow(ref: string): Promise<PayNowResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    if (typeof ref !== "string" || !REF.test(ref)) {
        return { ok: false, message: OFFLINE };
    }
    const call = await accountFetch(`me/invoices/${ref}/pay`, {
        method: "POST",
        body: {},
    });
    if (!call?.ok) return { ok: false, message: OFFLINE };
    if (call.res.status === 404) {
        return {
            ok: false,
            message:
                "That invoice isn't waiting to be paid any more. Refresh the page.",
        };
    }
    return payNowAnswer(
        call.res.status,
        await call.res.json().catch(() => null),
        OFFLINE,
    );
}

/**
 * Whether the business may email the customer (DEC-142): their own yes or
 * no, and nothing else. A real boolean only: anything else is refused here,
 * and the API takes no other field.
 */
export async function saveEmailChoice(email: boolean): Promise<NoticesResult> {
    if (!(await siteOrigin())) return { ok: false, message: OFFLINE };
    if (await testMode()) return TEST_RELEASE_REFUSAL;
    if (!accountAreaOn()) return { ok: false, message: OFFLINE };
    if (typeof email !== "boolean") return { ok: false, message: OFFLINE };
    const call = await accountFetch("me/notifications", {
        method: "PATCH",
        body: { email },
    });
    if (!call?.ok) return { ok: false, message: OFFLINE };
    const body: unknown = await call.res.json().catch(() => null);
    const notices = call.res.ok ? noticesResult(body) : null;
    return notices
        ? { ok: true, notices }
        : {
              ok: false,
              message: refusalMessage(call.res.status, body, OFFLINE),
          };
}
