"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { SAROH_CONTACT_EMAIL } from "@/content/contact";
import { CONTACT_PAGE, FIRST_TOPIC } from "@/content/contact-page";
import { cn } from "@/lib/cn";
import type {
    ContactField,
    ContactKindId,
    ContactResult,
    ContactTopicId,
} from "@/lib/contact-message";
import {
    CONTACT_LIMITS,
    contactProblems,
    firstName,
} from "@/lib/contact-message";

const copy = CONTACT_PAGE.form;
const done = CONTACT_PAGE.done;

/** The design's focus ring: Saffron 500, two pixels. */
const RING =
    "focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

// `focus:ring-0` takes off the forms plugin's blue ring: the design's ring
// is the Saffron outline, and the border keeps its own colour.
const FIELD = cn(
    "w-full min-w-0 rounded-[11px] border bg-white font-sans text-[16px] font-normal text-foreground placeholder:text-muted-foreground focus:ring-0 focus:ring-offset-0 focus-visible:outline-offset-1",
    RING,
);

const LABEL = "text-[14.5px] font-semibold";

/** The border of a field: red once a send was tried and it is at fault. */
const edge = (wrong: boolean) =>
    wrong
        ? "border-destructive focus:border-destructive"
        : "border-border-strong focus:border-border-strong";

type Send =
    | { at: "idle" | "sending" }
    /** The API refused one field the form's own check let through. */
    | { at: "refused"; field: ContactField }
    | { at: "failed"; why: "rate-limited" | "unavailable" };

/**
 * /contact's form (design "Contact", DEC-137): what it's about (four chips,
 * the chosen one in Ink), name, email, the kind of business (optional) and
 * the message, whose placeholder follows the topic.
 *
 * Nothing is checked until Send is pressed. From then on every field at
 * fault has the red border, one line says the first of them, and the
 * keyboard goes to that field. A good message posts to `/api/contact`,
 * which hands it to the API; the button says "Sending…" and can't be
 * pressed twice. If the send fails, the form keeps what was typed and says
 * so, with the address to write to instead. Once it has gone, the card
 * thanks them by first name and names the email; "Send another message"
 * keeps the name and email and starts the rest again.
 *
 * What they typed is masked in a session recording: every input is by the
 * recorder's own rule, and the thanks, which says the name and the email
 * back, is marked `data-ph-mask` (DEC-125).
 */
export function ContactForm() {
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
        const step =
            e.key === "ArrowRight" || e.key === "ArrowDown"
                ? 1
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? -1
                  : 0;
        if (!step) return;
        e.preventDefault();
        const next = (i + step + copy.topics.length) % copy.topics.length;
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
        let result: ContactResult;
        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic,
                    name: name.trim(),
                    email: email.trim(),
                    ...(kind ? { kind } : {}),
                    message: message.trim(),
                }),
            });
            result = (await res.json()) as ContactResult;
        } catch {
            result = { sent: false, failure: "unavailable" };
        }
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

    if (sent) {
        return (
            <div
                role="status"
                className="grid justify-items-start gap-[14px] py-3"
                // The name and the email, said back (DEC-125).
                data-ph-mask=""
            >
                <svg
                    width={40}
                    height={40}
                    viewBox="0 0 64 64"
                    fill="none"
                    aria-hidden
                    className="text-foreground"
                >
                    <path
                        d="M44 11 L27 26 L40 37 L20 53"
                        stroke="currentColor"
                        strokeWidth={8.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <circle cx={50} cy={48} r={6} className="fill-brand-500" />
                </svg>
                <h2
                    ref={thanks}
                    tabIndex={-1}
                    className="m-0 font-display text-[28px] font-semibold tracking-[-0.02em] focus:outline-none"
                >
                    {done.title(firstName(name))}
                </h2>
                <p className="m-0 max-w-[44ch] text-[16px] leading-[1.6] text-mk-copy">
                    {done.replyTo}{" "}
                    <span className="break-all">{email.trim()}</span>{" "}
                    {done.replyBy}.{done.urgent}
                </p>
                <button
                    type="button"
                    onClick={again}
                    className={cn(
                        "h-11 cursor-pointer rounded-[11px] border border-border-strong bg-transparent px-[18px] font-sans text-[15px] font-semibold text-foreground transition-colors duration-fast ease-out hover:bg-muted focus-visible:outline-offset-2",
                        RING,
                    )}
                >
                    {done.again}
                </button>
            </div>
        );
    }

    const describedBy = (field: ContactField) =>
        first === field ? "contact-error" : undefined;

    return (
        <form
            noValidate
            onSubmit={onSubmit}
            aria-labelledby="contact-form-title"
            className="grid gap-[18px]"
        >
            <div className="grid gap-1">
                <h2
                    id="contact-form-title"
                    className="m-0 font-display text-[24px] font-semibold tracking-[-0.02em]"
                >
                    {copy.title}
                </h2>
                <span className="text-[14px] text-muted-foreground">
                    {copy.note}
                </span>
            </div>

            <div className="grid gap-2">
                <span id="contact-topic-label" className={LABEL}>
                    {copy.topicLabel}
                </span>
                <div
                    role="radiogroup"
                    aria-labelledby="contact-topic-label"
                    className="flex flex-wrap gap-2"
                >
                    {copy.topics.map((t, i) => {
                        const on = t.id === topic;
                        return (
                            <button
                                key={t.id}
                                ref={(el) => {
                                    chips.current[i] = el;
                                }}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                tabIndex={on ? 0 : -1}
                                onClick={() => setTopic(t.id)}
                                onKeyDown={(e) => onChipKey(e, i)}
                                className={cn(
                                    // 40px tall as drawn; on a very narrow phone a long
                                    // topic wraps inside its chip instead of running
                                    // past the card.
                                    "min-h-10 max-w-full cursor-pointer rounded-full border px-[14px] py-1 font-sans text-[14px] font-semibold leading-tight transition-colors duration-fast ease-out focus-visible:outline-offset-2",
                                    RING,
                                    on
                                        ? "border-foreground bg-foreground text-background"
                                        : "border-border-strong bg-white text-foreground hover:border-foreground",
                                )}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-[14px]">
                <div className="grid gap-1.5">
                    <label htmlFor="contact-name" className={LABEL}>
                        {copy.nameLabel}
                    </label>
                    <input
                        id="contact-name"
                        ref={(el) => {
                            fields.current.name = el;
                        }}
                        name="name"
                        type="text"
                        autoComplete="name"
                        maxLength={CONTACT_LIMITS.name}
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            edited("name");
                        }}
                        aria-required
                        aria-invalid={atFault("name") || undefined}
                        aria-describedby={describedBy("name")}
                        className={cn(
                            FIELD,
                            "h-12 px-[14px]",
                            edge(atFault("name")),
                        )}
                    />
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor="contact-email" className={LABEL}>
                        {copy.emailLabel}
                    </label>
                    <input
                        id="contact-email"
                        ref={(el) => {
                            fields.current.email = el;
                        }}
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={CONTACT_LIMITS.email}
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            edited("email");
                        }}
                        aria-required
                        aria-invalid={atFault("email") || undefined}
                        aria-describedby={describedBy("email")}
                        className={cn(
                            FIELD,
                            "h-12 px-[14px]",
                            edge(atFault("email")),
                        )}
                    />
                </div>
            </div>

            <div className="grid gap-1.5">
                <label htmlFor="contact-kind" className={LABEL}>
                    {copy.kindLabel}{" "}
                    <span className="font-normal text-muted-foreground">
                        {copy.optional}
                    </span>
                </label>
                <select
                    id="contact-kind"
                    name="kind"
                    value={kind}
                    onChange={(e) =>
                        setKind(e.target.value as ContactKindId | "")
                    }
                    className={cn(FIELD, "h-12 pl-3 pr-10", edge(false))}
                >
                    <option value="">{copy.kindNone}</option>
                    {copy.kinds.map((k) => (
                        <option key={k.id} value={k.id}>
                            {k.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid gap-1.5">
                <label htmlFor="contact-message" className={LABEL}>
                    {copy.messageLabel}
                </label>
                <textarea
                    id="contact-message"
                    ref={(el) => {
                        fields.current.message = el;
                    }}
                    name="message"
                    rows={5}
                    maxLength={CONTACT_LIMITS.message}
                    placeholder={copy.topics.find((t) => t.id === topic)?.hint}
                    value={message}
                    onChange={(e) => {
                        setMessage(e.target.value);
                        edited("message");
                    }}
                    aria-required
                    aria-invalid={atFault("message") || undefined}
                    aria-describedby={describedBy("message")}
                    className={cn(
                        FIELD,
                        "resize-y px-[14px] py-3 leading-[1.5]",
                        edge(atFault("message")),
                    )}
                />
            </div>

            {first ? (
                <p
                    id="contact-error"
                    role="alert"
                    className="m-0 text-[14.5px] font-semibold text-destructive"
                >
                    {copy.errors[first]}
                </p>
            ) : send.at === "failed" ? (
                <p
                    role="alert"
                    className="m-0 text-[14.5px] font-semibold text-destructive"
                >
                    {send.why === "rate-limited"
                        ? copy.rateLimited
                        : copy.failed}{" "}
                    <a
                        href={`mailto:${SAROH_CONTACT_EMAIL}`}
                        className="text-destructive"
                    >
                        {SAROH_CONTACT_EMAIL}
                    </a>
                    .
                </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3">
                <button
                    type="submit"
                    disabled={sending}
                    className={cn(
                        "h-[52px] max-w-full cursor-pointer rounded-mk-btn border-none bg-foreground px-[26px] font-sans text-base font-semibold text-background transition-[background-color,transform] duration-fast ease-out hover:bg-mk-ink-hover focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-progress",
                        RING,
                    )}
                >
                    {sending ? copy.sending : copy.submit}
                </button>
                <span className="text-mk-note text-muted-foreground">
                    {copy.orEmail}{" "}
                    <a
                        href={`mailto:${SAROH_CONTACT_EMAIL}`}
                        className={cn(
                            "rounded-sm text-brand-700 no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-offset-2",
                            RING,
                        )}
                    >
                        {SAROH_CONTACT_EMAIL}
                    </a>
                </span>
            </div>
        </form>
    );
}
