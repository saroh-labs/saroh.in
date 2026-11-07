/**
 * "Tell me when" under a paid plan (Global launch plan KTD8). saroh.tech is
 * static, so the browser posts straight to the API's public waitlist with
 * source `paid-plans` and Turnstile's token. The API answers a new and a
 * repeat address alike, so this can only say it went, not whether the
 * address was already on the list.
 */
export type TellMeWhenResult = "sent" | "email" | "check" | "unavailable";

const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const EMAIL_MAX = 320;

/** Whether the address is worth sending; the API checks it again. */
export const emailLooksRight = (email: string) => {
    const e = email.trim();
    return EMAIL.test(e) && e.length <= EMAIL_MAX;
};

export async function sendTellMeWhen(
    apiUrl: string,
    email: string,
    turnstileToken: string | null,
    fetcher: typeof fetch = fetch,
): Promise<TellMeWhenResult> {
    try {
        const res = await fetcher(`${apiUrl}/public/waitlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: email.trim(),
                source: "paid-plans",
                ...(turnstileToken ? { turnstileToken } : {}),
            }),
        });
        if (res.ok) return "sent";
        if (res.status === 400) return "email";
        return res.status === 403 ? "check" : "unavailable";
    } catch {
        return "unavailable";
    }
}
