"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useId, useState } from "react";

import { saveFile } from "../tools/download";
import type { GateEmailed } from "../tools/email-gate";
import { emailProblem, GATE_WORDS, useGate } from "../tools/email-gate";

/**
 * The form beside a download's title (#1206, boards downloads/Sample*): a
 * WhatsApp number or an email, then the page's first file downloads here
 * and the other formats are links. It is `EmailGate`'s state and submit
 * path (`useGate`) with the board's card around it.
 *
 * A number is never messaged (DEC-191/196: no approved template yet), so
 * nothing here says a WhatsApp message is coming. There is no tips box: an
 * unverified contact can't agree to marketing (5 Oct security review).
 *
 * Where it sends is the app's (`DownloadGateProvider`). Without one it
 * answers `unavailable`, never "sent" (31 Oct audit of the tools gate).
 */

export type DownloadContact = { email: string } | { phone: string };

export type DownloadResult =
    | { ok: true; emailed: GateEmailed }
    | {
          ok: false;
          reason: "bad-contact" | "rate-limited" | "challenge" | "unavailable";
      };

export type DownloadSubmit = (
    contact: DownloadContact,
) => Promise<DownloadResult>;

interface DownloadGateContextValue {
    submit: DownloadSubmit;
    privacy?: string;
    /** The bot check (Turnstile), drawn above the button when the app has one. */
    challenge?: ReactNode;
}

const unavailable: DownloadSubmit = () =>
    Promise.resolve({ ok: false, reason: "unavailable" });

/** The admin preview's submit: nothing is sent, nothing is fetched, the gate opens. */
const previewSubmit: DownloadSubmit = () =>
    Promise.resolve({ ok: true, emailed: "none" });

const Context = createContext<DownloadGateContextValue>({
    submit: unavailable,
});

/** Where every `<DownloadGate>` under it sends: saroh.in passes its unlock route. */
export function DownloadGateProvider({
    onSubmit,
    privacy,
    challenge,
    children,
}: {
    onSubmit: DownloadSubmit;
    privacy?: string;
    challenge?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Context.Provider value={{ submit: onSubmit, privacy, challenge }}>
            {children}
        </Context.Provider>
    );
}

type Via = "whatsapp" | "email";

export const DOWNLOAD_GATE_WORDS = {
    title: "Get the files",
    line: "Pick WhatsApp or email, and the files download right here.",
    via: "Where to reach you",
    whatsapp: "WhatsApp",
    email: "Email",
    phoneLabel: "WhatsApp number",
    emailLabel: "Email address",
    phonePlaceholder: "98765 43210",
    button: "Send me the files",
    sending: "Getting your files…",
    // The consent lines: change one, change DOWNLOAD_CONSENT_VERSION in the API's download-names.ts.
    noteWhatsapp:
        "We keep your number only to give you these files, and never message it.",
    noteEmail:
        "We use your email only to send you these files' link. No newsletter.",
    emptyPhone: "Type your WhatsApp number first.",
    shortPhone: "That number should be 10 digits, like 98765 43210.",
    badPhone:
        "That doesn't look like an Indian mobile number. Check it and try again.",
    challenge:
        "Finish the check above the button, then press it again. What you typed is still here.",
    unavailable:
        "We can't give out the files just now. Try again in a minute. What you typed is still here.",
    downloading: "Your files are downloading.",
    ready: "Your files are ready.",
    emailedTo: (email: string) => `We've also emailed the link to ${email}.`,
    limited:
        "We've emailed this address a few times today, so there's no email this time.",
    notSent: "We couldn't send the email just now.",
    get: (format: string, name: string) =>
        `Get the ${format} file (.${name.split(".").pop() ?? ""})`,
    anotherPhone: "Use another number",
    anotherEmail: "Use another email",
} as const;

/** The 10 digits of a typed Indian mobile (a +91, 91 or 0 in front is fine), or null. Shape only: the API is the authority. */
export function phoneDigits(value: string): string | null {
    const d = value.replace(/\D/g, "");
    const ten =
        d.length === 12 && d.startsWith("91")
            ? d.slice(2)
            : d.length === 11 && d.startsWith("0")
              ? d.slice(1)
              : d;
    return ten.length === 10 ? ten : null;
}

function problemOf(via: Via, value: string): string | null {
    if (via === "email") return emailProblem(value);
    if (!value.trim()) return DOWNLOAD_GATE_WORDS.emptyPhone;
    return phoneDigits(value) ? null : DOWNLOAD_GATE_WORDS.shortPhone;
}

interface GateFile {
    name: string;
    format: string;
}

export function DownloadGate({
    slug,
    files,
    title = DOWNLOAD_GATE_WORDS.title,
    line = DOWNLOAD_GATE_WORDS.line,
    preview = false,
}: {
    slug: string;
    /** The page's files; the first is the one that downloads. */
    files: readonly GateFile[];
    title?: string;
    line?: string;
    /** The admin preview: sends nothing, fetches nothing, links go nowhere. */
    preview?: boolean;
}) {
    const ctx = useContext(Context);
    const [via, setVia] = useState<Via>("whatsapp");
    const [value, setValue] = useState("");
    const [saved, setSaved] = useState(false);
    const id = useId();
    const href = (name: string) =>
        preview ? undefined : `/downloads/${slug}/${name}`;

    /** Fetches the first file and hands it to the browser; false when it couldn't. */
    async function saveFirst(): Promise<boolean> {
        const first = files[0];
        const url = first && href(first.name);
        if (!first || !url) return false;
        try {
            const res = await fetch(url);
            if (!res.ok) return false;
            saveFile(await res.blob(), first.name);
            return true;
        } catch {
            return false;
        }
    }

    const { state, send, lock } = useGate(
        async (contact: DownloadContact) => {
            const result = await (preview ? previewSubmit : ctx.submit)(
                contact,
            );
            if (result.ok) setSaved(await saveFirst());
            return result;
        },
        (reason) =>
            reason === "bad-contact"
                ? via === "email"
                    ? GATE_WORDS.badEmail
                    : DOWNLOAD_GATE_WORDS.badPhone
                : reason === "rate-limited"
                  ? GATE_WORDS.rateLimited
                  : reason === "challenge"
                    ? DOWNLOAD_GATE_WORDS.challenge
                    : DOWNLOAD_GATE_WORDS.unavailable,
    );

    const another =
        via === "email"
            ? DOWNLOAD_GATE_WORDS.anotherEmail
            : DOWNLOAD_GATE_WORDS.anotherPhone;

    if (state.at === "sent") {
        const emailed = state.emailed ?? "none";
        const links = saved ? files.slice(1) : files;
        return (
            <div className="sp-dl-gate">
                <p role="status" className="sp-dl-gate-done">
                    <span aria-hidden="true">✓ </span>
                    {saved
                        ? DOWNLOAD_GATE_WORDS.downloading
                        : DOWNLOAD_GATE_WORDS.ready}
                    {emailed === "sent"
                        ? ` ${DOWNLOAD_GATE_WORDS.emailedTo(value.trim())}`
                        : emailed === "limited"
                          ? ` ${DOWNLOAD_GATE_WORDS.limited}`
                          : emailed === "not-sent"
                            ? ` ${DOWNLOAD_GATE_WORDS.notSent}`
                            : ""}
                </p>
                {links.length ? (
                    <ul className="sp-dl-gate-files">
                        {links.map((f) => (
                            <li key={f.name}>
                                <a href={href(f.name)} download>
                                    {DOWNLOAD_GATE_WORDS.get(f.format, f.name)}
                                </a>
                            </li>
                        ))}
                    </ul>
                ) : null}
                <button
                    type="button"
                    className="sp-dl-gate-again"
                    onClick={() => {
                        setSaved(false);
                        lock();
                    }}
                >
                    {another}
                </button>
            </div>
        );
    }

    const error = state.at === "locked" ? state.error : null;
    const sending = state.at === "sending";
    const describedBy = error ? `${id}-error` : `${id}-note`;
    return (
        <form
            noValidate
            className="sp-dl-gate"
            aria-labelledby={`${id}-title`}
            onSubmit={(event) => {
                event.preventDefault();
                const problem = problemOf(via, value);
                if (problem) {
                    lock(problem);
                    return;
                }
                void send(
                    via === "email"
                        ? { email: value.trim() }
                        : { phone: `+91${phoneDigits(value) ?? ""}` },
                );
            }}
        >
            <div className="sp-dl-gate-head">
                <span id={`${id}-title`} className="sp-dl-gate-title">
                    {title}
                </span>
                <span className="sp-dl-gate-line">{line}</span>
            </div>
            <fieldset className="sp-dl-gate-via">
                <legend className="sp-sr">{DOWNLOAD_GATE_WORDS.via}</legend>
                {(["whatsapp", "email"] as const).map((v) => (
                    <label key={v} className="sp-dl-gate-opt">
                        <input
                            type="radio"
                            name={`${id}-via`}
                            value={v}
                            checked={via === v}
                            onChange={() => {
                                setVia(v);
                                setValue("");
                                lock();
                            }}
                        />
                        {DOWNLOAD_GATE_WORDS[v]}
                    </label>
                ))}
            </fieldset>
            <div className="sp-dl-gate-field">
                <label htmlFor={`${id}-contact`} className="sp-dl-gate-label">
                    {via === "email"
                        ? DOWNLOAD_GATE_WORDS.emailLabel
                        : DOWNLOAD_GATE_WORDS.phoneLabel}
                </label>
                <div className="sp-dl-gate-box">
                    {via === "whatsapp" ? (
                        <span className="sp-dl-gate-pre">+91</span>
                    ) : null}
                    <input
                        id={`${id}-contact`}
                        className="sp-dl-gate-input"
                        {...(via === "email"
                            ? {
                                  type: "email",
                                  autoComplete: "email",
                                  placeholder: GATE_WORDS.placeholder,
                              }
                            : {
                                  type: "tel",
                                  inputMode: "numeric" as const,
                                  autoComplete: "tel-national",
                                  placeholder:
                                      DOWNLOAD_GATE_WORDS.phonePlaceholder,
                              })}
                        value={value}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={describedBy}
                        onChange={(event) => {
                            setValue(event.target.value);
                            if (error) lock();
                        }}
                    />
                </div>
                {error ? (
                    <span
                        id={`${id}-error`}
                        role="alert"
                        className="sp-dl-gate-error"
                    >
                        {error}
                    </span>
                ) : null}
            </div>
            {ctx.challenge && !preview ? (
                <div className="sp-dl-gate-check">{ctx.challenge}</div>
            ) : null}
            <button type="submit" disabled={sending} className="sp-dl-gate-btn">
                {sending
                    ? DOWNLOAD_GATE_WORDS.sending
                    : DOWNLOAD_GATE_WORDS.button}
            </button>
            <p id={`${id}-note`} className="sp-dl-gate-note">
                {via === "email"
                    ? DOWNLOAD_GATE_WORDS.noteEmail
                    : DOWNLOAD_GATE_WORDS.noteWhatsapp}{" "}
                <a href={preview ? undefined : ctx.privacy}>
                    {GATE_WORDS.privacy}
                </a>
            </p>
        </form>
    );
}
