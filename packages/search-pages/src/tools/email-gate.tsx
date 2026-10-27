"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useId, useState } from "react";

/**
 * The one email gate every free tool puts on its output (#1253; owner D2:
 * the result shows free, the file asks for an email). The tool's own work
 * never leaves the browser: the gate sends the email and nothing else, and
 * where it sends it is the app's (`ToolGateProvider`). saroh.in wires the
 * QR code maker's unlock route; the admin preview leaves the provider out,
 * so a submit only shows the sent state.
 *
 * There is no news tickbox, as in the QR code maker: an address typed into
 * a public tool isn't verified, so it can't say yes to marketing. The
 * consent is the line under the field, and submitting is agreeing to it.
 */

export type GateResult =
    | { ok: true; emailed?: "sent" | "limited" | "not-sent" }
    | { ok: false; reason: "bad-email" | "rate-limited" | "unavailable" };

/** Sends the email (the only thing a tool sends) and says how it went. */
export type GateSubmit = (email: string) => Promise<GateResult>;

interface GateContextValue {
    submit: GateSubmit;
    /** The Privacy page; undefined draws the link with no address (the admin preview). */
    privacy?: string;
}

/** The admin preview's submit: nothing is sent, the gate opens. */
const previewSubmit: GateSubmit = () => Promise.resolve({ ok: true });

const GateContext = createContext<GateContextValue>({ submit: previewSubmit });

/** Where every `<EmailGate>` under it sends: saroh.in passes its unlock route. */
export function ToolGateProvider({
    onSubmit,
    privacy,
    children,
}: {
    onSubmit?: GateSubmit;
    privacy?: string;
    children: ReactNode;
}) {
    return (
        <GateContext.Provider
            value={{ submit: onSubmit ?? previewSubmit, privacy }}
        >
            {children}
        </GateContext.Provider>
    );
}

/** An email worth sending: something@something.something (as the QR code maker's). */
// Domain labels exclude "." so no two parts can match the same dots
// (CodeQL js/polynomial-redos).
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export const GATE_WORDS = {
    placeholder: "you@business.in",
    sending: "Sending…",
    note: "We'll email you a link back to this tool. No newsletter unless you ask. What you typed stays in your browser.",
    privacy: "Privacy",
    empty: "Type your email first.",
    noEnding: "That email is missing its ending, like .com or .in.",
    badEmail: "That email looks incomplete. Check it and try again.",
    rateLimited:
        "That's a lot of tries in a row. Wait a few minutes and try again. What you typed is still here.",
    failed: "We couldn't send it just now. Try again in a minute. What you typed is still here.",
    sentTo: (email: string) => `Sent to ${email}`,
    limited:
        "We've emailed this address a few times today, so there's no email this time.",
    notSent: "We couldn't send the email just now, but it's ready here.",
    again: "Send it again",
    another: "Use another email",
} as const;

/** Why a typed email can't be sent yet, or null when it can. */
export function emailProblem(value: string): string | null {
    const v = value.trim();
    if (!v) return GATE_WORDS.empty;
    if (EMAIL_SHAPE.test(v)) return null;
    return /^[^\s@]+@[^\s@.]+$/.test(v)
        ? GATE_WORDS.noEnding
        : GATE_WORDS.badEmail;
}

type State =
    | { at: "locked"; error: string | null }
    | { at: "sending" }
    | { at: "sent"; emailed: "sent" | "limited" | "not-sent" };

export interface EmailGateProps {
    /** What the email gets them: "Get this working as a PDF". */
    label: string;
    /** The button: "Email it". */
    button: string;
    /** What the gate unlocks (a Print or Download button), shown once it's open. */
    children?: ReactNode;
    /** A line under "Sent to …" saying what is ready; none by default. */
    sentLine?: string;
    /** Overrides the provider's submit (tests; saroh.in's own tools). */
    onSubmit?: GateSubmit;
    /** The consent line, when the tool sends more than the email (the link preview). */
    note?: string;
}

/**
 * Locked (label, email, button, the consent line) → sending → sent, with
 * what it unlocks, Send it again and Use another email; or an error under
 * the field, with what was typed kept. Its colours follow the result it
 * sits in (`.tp-result`: dark on a desk, white on a phone).
 */
export function EmailGate({
    label,
    button,
    children,
    sentLine,
    onSubmit,
    note = GATE_WORDS.note,
}: EmailGateProps) {
    const ctx = useContext(GateContext);
    const submit = onSubmit ?? ctx.submit;
    const [email, setEmail] = useState("");
    const [state, setState] = useState<State>({ at: "locked", error: null });
    const id = useId();

    async function send(value: string) {
        setState({ at: "sending" });
        let result: GateResult;
        try {
            result = await submit(value);
        } catch {
            result = { ok: false, reason: "unavailable" };
        }
        if (result.ok) {
            setState({ at: "sent", emailed: result.emailed ?? "sent" });
            return;
        }
        setState({
            at: "locked",
            error:
                result.reason === "bad-email"
                    ? GATE_WORDS.badEmail
                    : result.reason === "rate-limited"
                      ? GATE_WORDS.rateLimited
                      : GATE_WORDS.failed,
        });
    }

    if (state.at === "sent") {
        const value = email.trim();
        return (
            <div className="tp-gate">
                <p role="status" className="tp-gate-done">
                    {state.emailed === "sent" ? (
                        <>
                            <span aria-hidden="true">✓ </span>
                            {GATE_WORDS.sentTo(value)}
                        </>
                    ) : state.emailed === "limited" ? (
                        GATE_WORDS.limited
                    ) : (
                        GATE_WORDS.notSent
                    )}
                </p>
                {sentLine ? <p className="tp-gate-line">{sentLine}</p> : null}
                {children}
                <span className="tp-gate-links">
                    <button
                        type="button"
                        className="tp-linkbtn"
                        onClick={() => void send(value)}
                    >
                        {GATE_WORDS.again}
                    </button>
                    <button
                        type="button"
                        className="tp-linkbtn"
                        onClick={() => setState({ at: "locked", error: null })}
                    >
                        {GATE_WORDS.another}
                    </button>
                </span>
            </div>
        );
    }

    const error = state.at === "locked" ? state.error : null;
    const sending = state.at === "sending";
    return (
        <form
            noValidate
            className="tp-gate"
            onSubmit={(event) => {
                event.preventDefault();
                const problem = emailProblem(email);
                if (problem) {
                    setState({ at: "locked", error: problem });
                    return;
                }
                void send(email.trim());
            }}
        >
            <label htmlFor={`${id}-email`} className="tp-gate-label">
                {label}
            </label>
            <div className="tp-gate-row">
                <input
                    id={`${id}-email`}
                    type="email"
                    autoComplete="email"
                    placeholder={GATE_WORDS.placeholder}
                    value={email}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : `${id}-note`}
                    onChange={(event) => {
                        setEmail(event.target.value);
                        if (error) setState({ at: "locked", error: null });
                    }}
                    className="tp-input tp-gate-input"
                />
                <button
                    type="submit"
                    disabled={sending}
                    className="tp-btn tp-gate-btn"
                >
                    {sending ? GATE_WORDS.sending : button}
                </button>
            </div>
            {error ? (
                <span id={`${id}-error`} role="alert" className="tp-error">
                    {error}
                </span>
            ) : null}
            <span id={`${id}-note`} className="tp-gate-note">
                {note} <a href={ctx.privacy}>{GATE_WORDS.privacy}</a>
            </span>
        </form>
    );
}
