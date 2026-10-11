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

export function listContactMessages(params: {
    topic?: ContactTopic;
    cursor?: string;
}): Promise<ContactMessagePage | null> {
    const search = new URLSearchParams();
    if (params.topic) search.set("topic", params.topic);
    if (params.cursor) search.set("cursor", params.cursor);
    const query = search.toString();
    return getJson<ContactMessagePage>(
        `/contact-messages${query ? `?${query}` : ""}`,
    );
}
