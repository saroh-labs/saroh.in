import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { CONTACT_PAGE, FIRST_TOPIC } from "@/content/contact-page";
import type {
    ContactField,
    ContactKindId,
    ContactResult,
    ContactTopicId,
} from "@/lib/contact-message";
import { contactProblems } from "@/lib/contact-message";
import { nextIndex } from "@/lib/roving";

const copy = CONTACT_PAGE.form;

export type Send =
    | { at: "idle" | "sending" }
    /** The API refused one field the form's own check let through. */
    | { at: "refused"; field: ContactField }
    | { at: "failed"; why: "rate-limited" | "unavailable" };

/** Posts a message to `/api/contact`; an unreadable answer or no network is "unavailable". */
async function postContact(body: {
    topic: ContactTopicId;
    name: string;
    email: string;
    kind?: ContactKindId;
    message: string;
}): Promise<ContactResult> {
    try {
        const res = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return (await res.json()) as ContactResult;
    } catch {
        return { sent: false, failure: "unavailable" };
    }
}

/**
 * The contact form's state and send (DEC-183: the rules stay out of the
 * drawing). See `ContactForm` for what it does on screen.
 */
export function useContactForm() {
    const [topic, setTopic] = useState<ContactTopicId>(FIRST_TOPIC);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [kind, setKind] = useState<ContactKindId | "">("");
    const [message, setMessage] = useState("");
    const [tried, setTried] = useState(false);
    const [send, setSend] = useState<Send>({ at: "idle" });
    const [sent, setSent] = useState(false);

    const chips = useRef<(HTMLButtonElement | null)[]>([]);
    const fields = useRef<
        Partial<
            Record<ContactField, HTMLInputElement | HTMLTextAreaElement | null>
        >
    >({});
    const thanks = useRef<HTMLHeadingElement | null>(null);
    /**
     * Where the keyboard goes once the card has changed over: to the thanks
     * when a message has gone, to the message box when the form comes back.
     */
    const focusNext = useRef<"thanks" | "message" | null>(null);

    useEffect(() => {
        const target = focusNext.current;
        if (!target) return;
        focusNext.current = null;
        if (target === "thanks") thanks.current?.focus();
        else fields.current.message?.focus();
    }, [sent]);

    const problems = tried ? contactProblems({ name, email, message }) : [];
    const refused = send.at === "refused" ? send.field : null;
    const atFault = (field: ContactField) =>
        problems.includes(field) || refused === field;
    /** The one field the line is about: the first at fault. */
    const first: ContactField | null = problems.at(0) ?? refused;
    const sending = send.at === "sending";

    /** Typing in a field the API refused clears its refusal. */
    const edited = (field: ContactField) => {
        if (send.at === "failed" || refused === field) setSend({ at: "idle" });
    };

    const onChipKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
        const next = nextIndex(e.key, i, copy.topics.length);
        if (next === null) return;
        e.preventDefault();
        setTopic(copy.topics[next].id);
        chips.current[next]?.focus();
    };

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (sending) return;
        const wrong = contactProblems({ name, email, message });
        if (wrong.length > 0) {
            setTried(true);
            setSend({ at: "idle" });
            // The first field at fault takes the keyboard.
            const firstWrong = wrong.at(0);
            if (firstWrong) fields.current[firstWrong]?.focus();
            return;
        }
        setSend({ at: "sending" });
        const result = await postContact({
            topic,
            name: name.trim(),
            email: email.trim(),
            ...(kind ? { kind } : {}),
            message: message.trim(),
        });
        if (result.sent) {
            setSend({ at: "idle" });
            setSent(true);
            focusNext.current = "thanks";
            return;
        }
        const failure = result.failure;
        if (
            failure === "name" ||
            failure === "email" ||
            failure === "message"
        ) {
            setTried(true);
            setSend({ at: "refused", field: failure });
            fields.current[failure]?.focus();
            return;
        }
        // Too many, the API out of reach, or an answer this form can't
        // read: the message did not go, and the form says so.
        setSend({
            at: "failed",
            why: failure === "rate-limited" ? "rate-limited" : "unavailable",
        });
    };

    /** "Send another message": the name and the email stay. */
    const again = () => {
        setSent(false);
        setMessage("");
        setTopic(FIRST_TOPIC);
        setTried(false);
        setSend({ at: "idle" });
        focusNext.current = "message";
    };

    /** Hands a field's element to the form, so a fault can take the keyboard. */
    const fieldRef =
        (field: ContactField) =>
        (el: HTMLInputElement | HTMLTextAreaElement | null) => {
            fields.current[field] = el;
        };
    const chipRef = (i: number) => (el: HTMLButtonElement | null) => {
        chips.current[i] = el;
    };

    const describedBy = (field: ContactField) =>
        first === field ? "contact-error" : undefined;

    return {
        topic,
        setTopic,
        name,
        setName,
        email,
        setEmail,
        kind,
        setKind,
        message,
        setMessage,
        send,
        sent,
        sending,
        first,
        atFault,
        edited,
        describedBy,
        chipRef,
        fieldRef,
        thanks,
        onChipKey,
        onSubmit,
        again,
    };
}
