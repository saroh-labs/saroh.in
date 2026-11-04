/**
 * A message from /contact. saroh.tech is static, so the browser posts straight
 * to the API's public `POST /public/contact-messages`, which answers any origin
 * without credentials, limits by the caller's address, checks every field again,
 * and files the message under the edition of the address it came through.
 */
export type ContactTopicId = "question" | "help" | "bug" | "other";
export type ContactKindId =
    | "salon"
    | "gym"
    | "clinic"
    | "coach"
    | "food"
    | "shop"
    | "creator"
    | "other";
export type ContactField = "name" | "email" | "message";
export type ContactResult = "sent" | "email" | "rate-limited" | "unavailable";

export interface ContactBody {
    topic: ContactTopicId;
    name: string;
    email: string;
    kind?: ContactKindId;
    message: string;
}

/** The API's limits, checked here first so the form can say which field. */
export const CONTACT_LIMITS = { name: 120, email: 320, message: 5000 } as const;
const MESSAGE_MIN = 5;
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Every field at fault, in the form's order. */
export function contactProblems(
    input: Record<ContactField, string>,
): ContactField[] {
    const name = input.name.trim();
    const email = input.email.trim();
    const message = input.message.trim();
    return [
        !name || name.length > CONTACT_LIMITS.name ? ("name" as const) : null,
        !EMAIL.test(email) || email.length > CONTACT_LIMITS.email
            ? ("email" as const)
            : null,
        message.length < MESSAGE_MIN || message.length > CONTACT_LIMITS.message
            ? ("message" as const)
            : null,
    ].filter((f) => f !== null);
}

/** "Asha" from "Asha Rao". */
export const firstName = (name: string) =>
    name.trim().split(/\s+/)[0] || "there";

/** What the page checks first, the API may still refuse: its email check is stricter. */
export async function sendContact(
    apiUrl: string,
    body: ContactBody,
    fetcher: typeof fetch = fetch,
): Promise<ContactResult> {
    try {
        const res = await fetcher(`${apiUrl}/public/contact-messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (res.ok) return "sent";
        if (res.status === 429) return "rate-limited";
        return res.status === 400 ? "email" : "unavailable";
    } catch {
        return "unavailable";
    }
}
