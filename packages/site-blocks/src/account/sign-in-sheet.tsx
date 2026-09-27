"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { focusRing, quietFill } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type {
    CodeRequestResult,
    SignedInCustomer,
    SignInApi,
    SignInOptions,
    VerifyResult,
} from "./api";
import {
    callLine,
    codeDigits,
    looksLikeEmail,
    retryText,
    UNAVAILABLE_TEXT,
} from "./api";
import { ChallengeWidget } from "./challenge";

/**
 * The sign-in sheet on a merchant's site (ADR-011; round-2 plan A, A3), as
 * the Customer Site design draws it: a sheet from the bottom, email first,
 * then the six-digit code. One flow for new and returning customers — "The
 * same code creates your account" — and it never says whether an account
 * existed. Email only this round (ADR-011 §6).
 *
 * Opened at the last step of booking (A9), it leads with "Last step: confirm
 * it's you". When the code can't be sent it says so, with the business's
 * phone when there is one, and nothing is booked: there is no guest path.
 *
 * It takes focus, keeps Tab inside, closes on Escape and gives focus back
 * to whatever opened it. Drawn in the site's own tokens and type only (H1).
 * It never calls the API: the site's server actions arrive as `api`.
 */

export interface SignInSheetProps {
    open: boolean;
    onClose: () => void;
    options: SignInOptions;
    api: SignInApi;
    /** "book": asked at the last step of booking or buying. */
    purpose?: "book" | "sign-in";
    onSignedIn: (customer: SignedInCustomer) => void;
}

type Problem =
    | Exclude<CodeRequestResult, { ok: true }>
    | Exclude<VerifyResult, { ok: true }>;

const input = cn(
    "border-site-border bg-site-bg text-site-fg mt-1.5 block h-[50px] w-full rounded-[calc(var(--site-radius)+10px)] border px-3.5 text-[17px]",
    focusRing,
);

function primaryButton(off: boolean): string {
    return cn(
        "mt-4 block h-[52px] w-full rounded-[calc(var(--site-radius)+10px)] text-base font-bold",
        focusRing,
        off
            ? cn("text-site-muted cursor-default", quietFill)
            : "bg-site-accent text-site-accent-fg cursor-pointer hover:opacity-90",
    );
}

const altButton = cn(
    "text-site-fg mt-2 block h-11 w-full cursor-pointer text-sm font-semibold underline",
    focusRing,
);

export function SignInSheet({
    open,
    onClose,
    options,
    api,
    purpose = "sign-in",
    onSignedIn,
}: SignInSheetProps) {
    const ids = useId();
    const sheet = useRef<HTMLDivElement>(null);
    const field = useRef<HTMLInputElement>(null);
    const opener = useRef<Element | null>(null);

    const [step, setStep] = useState<"email" | "code">("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<Problem | null>(null);
    const [siteKey, setSiteKey] = useState<string | null>(
        options.challenge.required ? options.challenge.siteKey : null,
    );
    const [token, setToken] = useState<string | null>(null);

    // Focus in on open; back to the opener on close.
    useEffect(() => {
        if (!open) return;
        opener.current = document.activeElement;
        field.current?.focus();
        return () => {
            if (opener.current instanceof HTMLElement) opener.current.focus();
        };
    }, [open]);

    // Each step starts with its field focused.
    useEffect(() => {
        if (open) field.current?.focus();
    }, [open, step]);

    if (!open) return null;

    const { businessName, phone } = options;
    const emailReady = looksLikeEmail(email) && (!siteKey || token !== null);
    const codeReady = codeDigits(code).length === 6;

    async function sendCode() {
        if (busy || !emailReady) return;
        setBusy(true);
        setProblem(null);
        const result = await api
            .requestCode(email.trim(), token ?? undefined)
            .catch((): CodeRequestResult => ({ ok: false, reason: "error" }));
        setBusy(false);
        // A challenge token is good for one request.
        setToken(null);
        if (result.ok) {
            setCode("");
            setStep("code");
            return;
        }
        if (result.reason === "challenge") setSiteKey(result.siteKey);
        setProblem(result);
    }

    async function verify() {
        if (busy || !codeReady) return;
        setBusy(true);
        setProblem(null);
        const result = await api
            .verifyCode(email.trim(), codeDigits(code))
            .catch((): VerifyResult => ({ ok: false, reason: "error" }));
        setBusy(false);
        if (result.ok) {
            onSignedIn(result.customer);
            onClose();
            return;
        }
        setProblem(result);
    }

    function changeEmail() {
        setStep("email");
        setCode("");
        setProblem(null);
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key !== "Tab" || !sheet.current) return;
        const stops = Array.from(
            sheet.current.querySelectorAll<HTMLElement>(
                "button, input, a[href], iframe",
            ),
        ).filter((el) => !(el as HTMLButtonElement).disabled);
        const first = stops.at(0);
        const last = stops.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    const title =
        step === "email" ? `Sign in — ${businessName}` : "Enter the code";
    const lead =
        step === "code"
            ? `We sent a 6-digit code to ${email.trim()}.`
            : purpose === "book"
              ? "Last step: confirm it's you, then we'll finish. No password."
              : "No password. We'll send you a one-time code.";
    const expired = problem?.reason === "expired";

    return (
        <>
            <div
                aria-hidden="true"
                onClick={onClose}
                className="fixed inset-0 z-[60] bg-[hsl(var(--site-fg)/0.45)]"
            />
            <div
                ref={sheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${ids}-title`}
                aria-describedby={`${ids}-lead`}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className="bg-site-surface text-site-fg font-site-body fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[88vh] max-w-[560px] overflow-y-auto rounded-t-[calc(var(--site-radius)+18px)] px-[18px] pb-[calc(20px+env(safe-area-inset-bottom))] pt-[18px] shadow-[0_-12px_40px_hsl(var(--site-fg)/0.2)] outline-none"
            >
                <div className="flex items-center gap-2.5">
                    <h2
                        id={`${ids}-title`}
                        className="font-site-heading flex-1 text-[21px] font-semibold tracking-[-0.015em]"
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className={cn(
                            "text-site-fg size-[34px] shrink-0 cursor-pointer rounded-full text-base",
                            quietFill,
                            focusRing,
                        )}
                    >
                        ✕
                    </button>
                </div>
                <p
                    id={`${ids}-lead`}
                    className="text-site-body mt-1.5 text-sm leading-normal"
                >
                    {lead}
                </p>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void (step === "email" ? sendCode() : verify());
                    }}
                    noValidate
                >
                    {step === "email" ? (
                        <label className="mt-3.5 block text-[13.5px] font-medium">
                            Email
                            <input
                                ref={field}
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                placeholder="you@example.in"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={input}
                            />
                        </label>
                    ) : (
                        <label className="mt-3.5 block text-[13.5px] font-medium">
                            Code
                            <input
                                ref={field}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="• • • • • •"
                                value={code}
                                onChange={(e) =>
                                    setCode(codeDigits(e.target.value))
                                }
                                className={cn(input, "tracking-[0.4em]")}
                            />
                        </label>
                    )}

                    {step === "email" && siteKey ? (
                        <ChallengeWidget siteKey={siteKey} onToken={setToken} />
                    ) : null}

                    {problem ? (
                        <ProblemText
                            problem={problem}
                            businessName={businessName}
                            phone={phone}
                        />
                    ) : null}

                    {step === "email" ? (
                        <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                            New here? The same code creates your account.
                        </p>
                    ) : null}

                    <button
                        type="submit"
                        disabled={
                            busy ||
                            (step === "email" ? !emailReady : !codeReady)
                        }
                        className={primaryButton(
                            busy ||
                                (step === "email" ? !emailReady : !codeReady),
                        )}
                    >
                        {step === "email"
                            ? busy
                                ? "Sending…"
                                : "Send code"
                            : busy
                              ? "Checking…"
                              : "Sign in"}
                    </button>
                </form>

                {step === "code" && expired ? (
                    <button
                        type="button"
                        onClick={() => void sendCode()}
                        className={altButton}
                    >
                        Send a new code
                    </button>
                ) : null}
                {step === "code" ? (
                    <button
                        type="button"
                        onClick={changeEmail}
                        className={altButton}
                    >
                        Change email
                    </button>
                ) : null}
            </div>
        </>
    );
}

function ProblemText({
    problem,
    businessName,
    phone,
}: {
    problem: Problem;
    businessName: string;
    phone: string | null;
}) {
    let body: ReactNode;
    switch (problem.reason) {
        case "unavailable": {
            const call = callLine(businessName, phone);
            body = (
                <>
                    {UNAVAILABLE_TEXT}
                    {call ? (
                        <>
                            <br />
                            <a
                                href={`tel:${phone?.replace(/[^\d+]/g, "")}`}
                                className="underline"
                            >
                                {call}
                            </a>
                        </>
                    ) : null}
                </>
            );
            break;
        }
        case "limit":
        case "wait":
            body = `${retryText(problem.retryAfterSeconds)}.`;
            break;
        case "challenge":
            body = "Confirm you're not a robot, then send the code again.";
            break;
        case "closed":
            body = `${businessName} isn't taking sign-ins right now.`;
            break;
        case "email":
            body = "Enter your email address, like you@example.in.";
            break;
        case "invalid":
            body = "That code isn't right. Check the email and try again.";
            break;
        case "expired":
            body = "That code has expired. Send a new one.";
            break;
        case "merged":
            body = `This email now signs in as ${problem.signsInAs}. Use that email instead.`;
            break;
        case "blocked":
            body = `You can't sign in here. Please contact ${businessName}.`;
            break;
        default:
            body = "We couldn't reach the business. Try again in a moment.";
    }
    return (
        <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
            {body}
        </p>
    );
}
