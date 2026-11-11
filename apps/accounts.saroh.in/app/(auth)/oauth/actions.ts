"use server";

import { apiWrite } from "@/lib/api";

/** Where the browser goes next, or why it can't. */
export type OAuthStepResult =
    { ok: true; url: string } | { ok: false; error: string };

/**
 * The person picked a business for an AI app (U9). The API checks it is one
 * they may connect, keeps it for this sign-in and asks Better Auth where to
 * go next: the consent page, or straight back to the app.
 */
export async function pickBusinessAction(
    organizationId: string,
    oauthQuery: string,
): Promise<OAuthStepResult> {
    const answer = await apiWrite<{ url: string }>("POST", "/oauth/pick", {
        organizationId,
        oauthQuery,
    });
    return answer.ok
        ? { ok: true, url: answer.data.url }
        : { ok: false, error: answer.error };
}

/** Allow or Don't allow; either way the app gets its answer at its address. */
export async function consentAction(
    accept: boolean,
    oauthQuery: string,
): Promise<OAuthStepResult> {
    const answer = await apiWrite<{ url: string }>("POST", "/oauth/consent", {
        accept,
        oauthQuery,
    });
    return answer.ok
        ? { ok: true, url: answer.data.url }
        : { ok: false, error: answer.error };
}
