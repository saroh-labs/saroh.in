"use client";

import { Button } from "@saroh/marketing/button";
import { ChoiceChip } from "@saroh/marketing/choice-chip";
import { nextIndex } from "@saroh/marketing/roving";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { INPUT_CLASS } from "@/components/shared/field";
import { CONTACT } from "@/content/contact";
import type {
    ContactField,
    ContactKindId,
    ContactTopicId,
} from "@/lib/contact-message";
import {
    CONTACT_LIMITS,
    contactProblems,
    firstName,
    sendContact,
} from "@/lib/contact-message";

const copy = CONTACT.form;
const done = CONTACT.done;
const FIRST_TOPIC: ContactTopicId = "question";
const LABEL = "text-[14.5px] font-semibold";
const FIELD = `${INPUT_CLASS} md:!text-base placeholder:text-muted-foreground`;
const RED = "!border-destructive";

type Send =
    | { at: "idle" | "sending" }
    | { at: "failed"; message: string }
    | { at: "refused" };

/**
 * saroh.in's form. Nothing is checked until Send is pressed; from then on every
 * field at fault has the red border, one line says the first of them, and the
 * keyboard goes to it. A failed send keeps everything typed. Once sent, the card
 * thanks them; "Send another message" keeps the name and the email.
 */
export function ContactForm({ apiUrl }: { apiUrl: string }) {
    const [topic, setTopic] = useState<ContactTopicId>(FIRST_TOPIC);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [kind, setKind] = useState<ContactKindId | "">("");
    const [message, setMessage] = useState("");
    const [tried, setTried] = useState(false);
    const [send, setSend] = useState<Send>({ at: "idle" });
    const [sent, setSent] = useState(false);

    const form = useRef<HTMLFormElement>(null);
    const chips = useRef<(HTMLButtonElement | null)[]>([]);
    const thanks = useRef<HTMLHeadingElement>(null);
    const focusNext = useRef<"thanks" | "message" | null>(null);

    const focusField = (field: ContactField) =>
        form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();

    useEffect(() => {
        const target = focusNext.current;
        focusNext.current = null;
        if (target === "thanks") thanks.current?.focus();
        if (target === "message") focusField("message");
    }, [sent]);

    const problems = tried ? contactProblems({ name, email, message }) : [];
    const refusedEmail = send.at === "refused";
    const atFault = (field: ContactField) =>
        problems.includes(field) || (refusedEmail && field === "email");
    const first: ContactField | null =
        problems.at(0) ?? (refusedEmail ? "email" : null);
    const sending = send.at === "sending";
    const fieldProps = (field: ContactField) => ({
        id: `contact-${field}`,
        name: field,
        maxLength: CONTACT_LIMITS[field],
        "aria-required": true,
        "aria-invalid": atFault(field) || undefined,
        "aria-describedby": first === field ? "contact-error" : undefined,
    });
    const edited = () => {
        if (send.at !== "idle" && send.at !== "sending") {
            setSend({ at: "idle" });
        }
    };

    const onChipKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
        const next = nextIndex(e.key, i, copy.topics.length);
        if (next === null) return;
        e.preventDefault();
        setTopic(copy.topics[next].id);
        chips.current[next]?.focus();
    };

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (sending) return;
        const wrong = contactProblems({ name, email, message });
        if (wrong.length > 0) {
            setTried(true);
            setSend({ at: "idle" });
            focusField(wrong[0]);
            return;
        }
        setSend({ at: "sending" });
        const result = await sendContact(apiUrl, {
            topic,
            name: name.trim(),
            email: email.trim(),
            ...(kind ? { kind } : {}),
            message: message.trim(),
        });
        if (result === "sent") {
            setSend({ at: "idle" });
            focusNext.current = "thanks";
            setSent(true);
        } else if (result === "email") {
            setSend({ at: "refused" });
            focusField("email");
        } else {
            setSend({
                at: "failed",
                message:
                    result === "rate-limited" ? copy.rateLimited : copy.failed,
            });
        }
    };

    const again = () => {
        setMessage("");
        setTopic(FIRST_TOPIC);
        setTried(false);
        focusNext.current = "message";
        setSent(false);
    };

    if (sent) {
        return (
            <div
                role="status"
                className="grid justify-items-start gap-[14px] py-3"
                data-ph-mask=""
            >
                <h2
                    ref={thanks}
                    tabIndex={-1}
                    className="m-0 font-display text-[28px] font-semibold tracking-[-0.02em] focus:outline-none"
                >
                    {done.title(firstName(name))}
                </h2>
                <p className="m-0 max-w-[44ch] text-[16px] leading-[1.6] text-mk-copy">
                    {done.replyTo}{" "}
                    <span className="break-all">{email.trim()}</span>.
                </p>
                <Button variant="secondary" size="sm" onClick={again}>
                    {done.again}
                </Button>
            </div>
        );
    }

    return (
        <form
            ref={form}
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
                            <ChoiceChip
                                key={t.id}
                                ref={(el) => {
                                    chips.current[i] = el;
                                }}
                                role="radio"
                                aria-checked={on}
                                tabIndex={on ? 0 : -1}
                                on={on}
                                onClick={() => setTopic(t.id)}
                                onKeyDown={(e) => onChipKey(e, i)}
                            >
                                {t.label}
                            </ChoiceChip>
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
                        {...fieldProps("name")}
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            edited();
                        }}
                        className={`${FIELD} !h-12 ${atFault("name") ? RED : ""}`}
                    />
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor="contact-email" className={LABEL}>
                        {copy.emailLabel}
                    </label>
                    <input
                        {...fieldProps("email")}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            edited();
                        }}
                        className={`${FIELD} !h-12 ${atFault("email") ? RED : ""}`}
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
                    className={`${FIELD} !h-12 pl-3 pr-10`}
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
                    {...fieldProps("message")}
                    rows={5}
                    placeholder={copy.topics.find((t) => t.id === topic)?.hint}
                    value={message}
                    onChange={(e) => {
                        setMessage(e.target.value);
                        edited();
                    }}
                    className={`${FIELD} !h-auto resize-y py-3 leading-[1.5] ${atFault("message") ? RED : ""}`}
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
                    {send.message}
                </p>
            ) : null}

            <div>
                <Button type="submit" disabled={sending}>
                    {sending ? copy.sending : copy.submit}
                </Button>
            </div>
        </form>
    );
}
