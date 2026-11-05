import { getJson } from "./control-plane";

/**
 * Messages people send from saroh.in/contact (DEC-137), as the console reads
 * them. Server-only.
 */

/** The form's topics, in its order, as the console names them. */
export const CONTACT_TOPIC_LABELS = {
    question: "A question before signing up",
    help: "Help with an account",
    bug: "Something's not working",
    other: "Partnerships or press",
} as const;

export type ContactTopic = keyof typeof CONTACT_TOPIC_LABELS;

export interface ContactMessageRow {
    id: string;
    topic: string;
    name: string;
    email: string;
    /** One of the waitlist's kinds of business; null when none was chosen. */
    kind: string | null;
    message: string;
    createdAt: string;
    /** When staff marked it handled; null while open. */
    handledAt: string | null;
    /** Where else this person appears, for read-only links. */
    links: { lead: boolean; waitlist: boolean; userId: string | null };
}

export interface ContactMessagePage {
    items: ContactMessageRow[];
    nextCursor?: string;
}

/** Whether a stored or asked-for topic is one of the form's own. */
const isTopic = (value: string): value is ContactTopic =>
    Object.hasOwn(CONTACT_TOPIC_LABELS, value);

/** The topic a query string asks for; every topic unless it names one. */
export function contactTopic(
    value: string | undefined,
): ContactTopic | undefined {
    return value !== undefined && isTopic(value) ? value : undefined;
}

/** A topic as the console names it; one it doesn't know is shown as stored. */
export function topicLabel(topic: string): string {
    return isTopic(topic) ? CONTACT_TOPIC_LABELS[topic] : topic;
}

/** Open (not handled yet) or handled; both unless one is asked for. */
export type MessageState = "open" | "handled";

export function messageState(
    value: string | undefined,
): MessageState | undefined {
    return value === "open" || value === "handled" ? value : undefined;
}

export function listContactMessages(params: {
    topic?: ContactTopic;
    state?: MessageState;
    email?: string;
    cursor?: string;
}): Promise<ContactMessagePage | null> {
    const search = new URLSearchParams();
    if (params.topic) search.set("topic", params.topic);
    if (params.state) search.set("state", params.state);
    if (params.email) search.set("email", params.email);
    if (params.cursor) search.set("cursor", params.cursor);
    const query = search.toString();
    return getJson<ContactMessagePage>(
        `/contact-messages${query ? `?${query}` : ""}`,
    );
}
