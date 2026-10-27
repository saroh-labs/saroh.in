"use client";

import { SAROH_CONTACT_EMAIL } from "@/content/contact";
import { CONTACT_PAGE } from "@/content/contact-page";
import type { ContactKindId } from "@/lib/contact-message";
import { CONTACT_LIMITS, firstName } from "@/lib/contact-message";

import { Button } from "../shared/buttons/button";
import { ChoiceChip } from "../shared/fields/choice-chips";
import { fieldClasses } from "../shared/fields/field-classes";
import { textLinkClasses } from "../shared/links/text-link";
import { useContactForm } from "./use-contact-form";

const copy = CONTACT_PAGE.form;
const done = CONTACT_PAGE.done;

const LABEL = "text-[14.5px] font-semibold";

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
    const form = useContactForm();
    const { topic, setTopic, name, setName, email, setEmail } = form;
    const { kind, setKind, message, setMessage, send, sent } = form;
    const { sending, first, atFault, edited, describedBy } = form;
    const { chipRef, fieldRef, thanks, onChipKey, onSubmit, again } = form;

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
                <Button variant="secondary" size="sm" onClick={again}>
                    {done.again}
                </Button>
            </div>
        );
    }

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
                            <ChoiceChip
                                key={t.id}
                                ref={chipRef(i)}
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
                        id="contact-name"
                        ref={fieldRef("name")}
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
                        className={fieldClasses({
                            invalid: atFault("name"),
                            className: "h-12 w-full",
                        })}
                    />
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor="contact-email" className={LABEL}>
                        {copy.emailLabel}
                    </label>
                    <input
                        id="contact-email"
                        ref={fieldRef("email")}
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
                        className={fieldClasses({
                            invalid: atFault("email"),
                            className: "h-12 w-full",
                        })}
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
                    className={fieldClasses({
                        className: "h-12 w-full pl-3 pr-10",
                    })}
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
                    ref={fieldRef("message")}
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
                    className={fieldClasses({
                        invalid: atFault("message"),
                        className: "w-full resize-y py-3 leading-[1.5]",
                    })}
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
                <Button type="submit" disabled={sending}>
                    {sending ? copy.sending : copy.submit}
                </Button>
                <span className="text-mk-note text-muted-foreground">
                    {copy.orEmail}{" "}
                    <a
                        href={`mailto:${SAROH_CONTACT_EMAIL}`}
                        className={textLinkClasses()}
                    >
                        {SAROH_CONTACT_EMAIL}
                    </a>
                </span>
            </div>
        </form>
    );
}
