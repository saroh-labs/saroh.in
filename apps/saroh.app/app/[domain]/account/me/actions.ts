"use server";

import type {
    CodeRequestResult,
    DetailsResult,
    NoteResult,
    VerifyResult,
} from "@saroh/site-blocks";

import { accountAreaOn } from "@/lib/account-area";
import {
    emailChangeAnswer,
    isAccountView,
    isNote,
    refusalMessage,
} from "@/lib/account-shape";
import { accountFetch } from "@/lib/customer-session";
import { siteOrigin } from "@/lib/origin";
import { codeCallFailed, codeResult, customerFromEmail } from "@/lib/sign-in";

/**
 * What a signed-in customer changes in Me (round-2 plan A, A5): their name
 * and phone, their sign-in email (a code to the new address), and a health
 * note for the team. Each runs on this server with the session cookie and
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
