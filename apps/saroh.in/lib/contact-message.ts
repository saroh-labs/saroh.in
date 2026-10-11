/**
 * A message from /contact (DEC-137): what the form sends to `/api/contact`,
 * and what that route answers. The route forwards to api.saroh.in's
 * `POST /public/contact-messages`, which validates again and stores it for
 * the team. Pure, so the page, the form and the route share one set of
 * rules and a server component can call it.
 */

/** The API's `CONTACT_TOPICS`. */
export const CONTACT_TOPIC_IDS = ["question", "help", "bug", "other"] as const;
export type ContactTopicId = (typeof CONTACT_TOPIC_IDS)[number];

/** The API's `WAITLIST_KINDS`: the kinds of business the form offers. */
export const CONTACT_KIND_IDS = [
    "salon",
    "gym",
    "clinic",
    "coach",
    "food",
    "shop",
    "creator",
    "other",
] as const;
export type ContactKindId = (typeof CONTACT_KIND_IDS)[number];

export interface ContactBody {
    topic: ContactTopicId;
    name: string;
    email: string;
    kind?: ContactKindId;
    message: string;
}

export type ContactField = "name" | "email" | "message";

export type ContactResult =
    | { sent: true }
    | {
          sent: false;
          failure: ContactField | "rate-limited" | "unavailable";
      };

/** The API's limits, checked here first so the form can say which field. */
export const CONTACT_LIMITS = { name: 120, email: 320, message: 5000 } as const;
export const CONTACT_MESSAGE_MIN = 5;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isTopic = (value: unknown): value is ContactTopicId =>
    (CONTACT_TOPIC_IDS as readonly unknown[]).includes(value);

const isKind = (value: unknown): value is ContactKindId =>
    (CONTACT_KIND_IDS as readonly unknown[]).includes(value);

/** The form's fields that can be at fault, in the order it asks them. */
const FIELDS = ["name", "email", "message"] as const;

const wrong: Record<ContactField, (value: string) => boolean> = {
    name: (value) => {
        const name = value.trim();
        return !name || name.length > CONTACT_LIMITS.name;
    },
    email: (value) => {
        const email = value.trim();
        return email.length > CONTACT_LIMITS.email || !EMAIL.test(email);
    },
    message: (value) => {
        const message = value.trim();
        return (
            message.length < CONTACT_MESSAGE_MIN ||
            message.length > CONTACT_LIMITS.message
        );
    },
};

type ContactFields = Record<ContactField, string>;

/** Every field at fault, in the form's order: each gets the red border. */
export function contactProblems(input: ContactFields): ContactField[] {
    return FIELDS.filter((field) => wrong[field](input[field]));
}

/**
 * The first field at fault (name, email, then message), or null when the
 * message can go. One at a time: the form shows one line.
 */
export function contactProblem(input: ContactFields): ContactField | null {
    return contactProblems(input)[0] ?? null;
}

/** "Asha" from "Asha Rao"; "there" when there is no name to greet. */
export function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || "there";
}

const text = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

/**
 * The API body for what the page posted, or the field at fault. Only these
 * five fields go on; anything else the page posts is dropped. A topic the
 * form doesn't offer is not a message from the form: null.
 */
export function contactBody(
    posted: unknown,
): ContactBody | { problem: ContactField } | null {
    if (typeof posted !== "object" || posted === null) return null;
    const p = posted as Record<string, unknown>;
    if (!isTopic(p.topic)) return null;
    const fields = {
        name: text(p.name).replace(/\s+/g, " "),
        email: text(p.email),
        message: text(p.message),
    };
    const problem = contactProblem(fields);
    if (problem) return { problem };
    return {
        topic: p.topic,
        ...fields,
        ...(isKind(p.kind) ? { kind: p.kind } : {}),
    };
}
