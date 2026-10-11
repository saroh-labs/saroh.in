"use client";

import type { FormEvent } from "react";
import { useRef, useState, useSyncExternalStore } from "react";

import { CUSTOMERS } from "@/content/customers";
import type { ReportField, ReportResult } from "@/lib/business-report";
import {
    prefilledSite,
    REPORT_LIMITS,
    reportProblem,
} from "@/lib/business-report";
import { cn } from "@/lib/cn";
import { readAddress } from "@/lib/page-address";

const copy = CUSTOMERS.form;

type Field = ReportField;

type State =
    | { at: "idle" | "sending" | "done" }
    | { at: "error"; message: string; field: Field | null };

const FIELD_MESSAGE: Record<Field, string> = {
    site: copy.badSite,
    message: copy.shortMessage,
    email: copy.badEmail,
    phone: copy.badPhone,
};

const isField = (failure: string): failure is Field => failure in FIELD_MESSAGE;

/** The address in the URL doesn't change while the page is open. */
const noChange = () => () => undefined;

const INPUT =
    "min-w-0 rounded-[10px] border bg-white px-3.5 font-sans text-[15px] text-foreground transition-colors duration-fast ease-out placeholder:text-muted-foreground hover:border-foreground focus:ring-0 focus:ring-offset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

/**
 * Report a business (/customers, Terms rev 46): the site's address, what
 * happened, and the reporter's own email and mobile number, all four asked
 * for (DEC-138). Posts to `/api/business-reports`. A Free merchant site's
 * "Report" link fills the address in from `?site=`, read in the browser so
 * the page stays static. The answer is the same whether or not the address
 * is a Saroh site.
 *
 * Send checks the fields in the form's order: the first at fault has the
 * red border, the one line says what it needs, and the keyboard goes to it.
 * A send that fails keeps everything typed. What is typed is masked in a
 * session recording by the recorder's own rule for every input (DEC-125),
 * and the thanks says none of it back.
 */
export function ReportForm() {
    // The link's address until they type their own: read in the browser
    // (the server draws the field empty), so the page stays static.
    const given = useSyncExternalStore(
        noChange,
        () => prefilledSite(readAddress()),
        () => "",
    );
    const [typed, setSite] = useState<string | null>(null);
    const site = typed ?? given;
    const [message, setMessage] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [state, setState] = useState<State>({ at: "idle" });
    const fields = useRef<
        Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>
    >({});

    /** Says what a field needs and puts the keyboard on it. */
    const fault = (field: Field) => {
        setState({ at: "error", message: FIELD_MESSAGE[field], field });
        fields.current[field]?.focus();
    };

    const clear = () => {
        if (state.at === "error") setState({ at: "idle" });
    };

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const problem = reportProblem({ site, message, email, phone });
        if (problem) {
            fault(problem);
            return;
        }
        setState({ at: "sending" });
        try {
            const res = await fetch("/api/business-reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    site: site.trim(),
                    message: message.trim(),
                    email: email.trim(),
                    phone: phone.trim(),
                }),
            });
            const body = (await res.json()) as ReportResult;
            if (body.sent) {
                setState({ at: "done" });
                return;
            }
            const failure = body.failure;
            if (isField(failure)) {
                fault(failure);
                return;
            }
            setState({
                at: "error",
                message:
                    failure === "rate-limited" ? copy.rateLimited : copy.failed,
                field: null,
            });
        } catch {
            setState({ at: "error", message: copy.failed, field: null });
        }
    };

    if (state.at === "done") {
        return (
            <p
                role="status"
                className="m-0 max-w-[600px] rounded-[10px] border border-border bg-card px-4 py-3 text-[15px] leading-[1.55] text-foreground"
            >
                {copy.done}
            </p>
        );
    }

    const wrong = (field: Field) =>
        state.at === "error" && state.field === field;
    const describedBy = (field: Field, hint?: string) =>
        [wrong(field) ? "report-error" : null, hint]
            .filter(Boolean)
            .join(" ") || undefined;

    return (
        <form
            noValidate
            onSubmit={onSubmit}
            aria-labelledby="report-title"
            className="grid max-w-[600px] gap-4"
        >
            <h2
                id="report-title"
                className="m-0 font-display text-[22px] font-semibold tracking-[-0.02em]"
            >
                {copy.title}
            </h2>
            <div className="grid gap-1.5">
                <label
                    htmlFor="report-site"
                    className="text-[14px] font-medium"
                >
                    {copy.siteLabel}
                </label>
                <input
                    ref={(el) => {
                        fields.current.site = el;
                    }}
                    id="report-site"
                    name="site"
                    type="text"
                    inputMode="url"
                    aria-required
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={REPORT_LIMITS.site}
                    placeholder={copy.sitePlaceholder}
                    value={site}
                    onChange={(e) => {
                        setSite(e.target.value);
                        clear();
                    }}
                    aria-invalid={wrong("site") || undefined}
                    aria-describedby={describedBy("site")}
                    className={cn(
                        INPUT,
                        "h-[46px]",
                        wrong("site")
                            ? "border-destructive"
                            : "border-border-strong",
                    )}
                />
            </div>
            <div className="grid gap-1.5">
                <label
                    htmlFor="report-message"
                    className="text-[14px] font-medium"
                >
                    {copy.messageLabel}
                </label>
                <textarea
                    ref={(el) => {
                        fields.current.message = el;
                    }}
                    id="report-message"
                    name="message"
                    rows={5}
                    aria-required
                    maxLength={REPORT_LIMITS.message}
                    value={message}
                    onChange={(e) => {
                        setMessage(e.target.value);
                        clear();
                    }}
                    aria-invalid={wrong("message") || undefined}
                    aria-describedby={describedBy(
                        "message",
                        "report-message-hint",
                    )}
                    className={cn(
                        INPUT,
                        "py-2.5 leading-[1.5]",
                        wrong("message")
                            ? "border-destructive"
                            : "border-border-strong",
                    )}
                />
                <p
                    id="report-message-hint"
                    className="m-0 text-mk-note leading-[1.5] text-muted-foreground"
                >
                    {copy.messageHint}
                </p>
            </div>
            <div className="grid gap-1.5">
                <label
                    htmlFor="report-email"
                    className="text-[14px] font-medium"
                >
                    {copy.emailLabel}
                </label>
                <input
                    ref={(el) => {
                        fields.current.email = el;
                    }}
                    id="report-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    aria-required
                    maxLength={REPORT_LIMITS.email}
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        clear();
                    }}
                    aria-invalid={wrong("email") || undefined}
                    aria-describedby={describedBy("email", "report-email-hint")}
                    className={cn(
                        INPUT,
                        "h-[46px]",
                        wrong("email")
                            ? "border-destructive"
                            : "border-border-strong",
                    )}
                />
                <p
                    id="report-email-hint"
                    className="m-0 text-mk-note leading-[1.5] text-muted-foreground"
                >
                    {copy.emailHint}
                </p>
            </div>
            <div className="grid gap-1.5">
                <label
                    htmlFor="report-phone"
                    className="text-[14px] font-medium"
                >
                    {copy.phoneLabel}
                </label>
                <input
                    ref={(el) => {
                        fields.current.phone = el;
                    }}
                    id="report-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    aria-required
                    maxLength={REPORT_LIMITS.phone}
                    value={phone}
                    onChange={(e) => {
                        setPhone(e.target.value);
                        clear();
                    }}
                    aria-invalid={wrong("phone") || undefined}
                    aria-describedby={describedBy("phone", "report-phone-hint")}
                    className={cn(
                        INPUT,
                        "h-[46px]",
                        wrong("phone")
                            ? "border-destructive"
                            : "border-border-strong",
                    )}
                />
                <p
                    id="report-phone-hint"
                    className="m-0 text-mk-note leading-[1.5] text-muted-foreground"
                >
                    {copy.phoneHint}
                </p>
            </div>
            {state.at === "error" ? (
                <p
                    id="report-error"
                    role="alert"
                    className="m-0 text-[14px] font-medium text-destructive"
                >
                    {state.message}
                </p>
            ) : null}
            <div>
                <button
                    type="submit"
                    disabled={state.at === "sending"}
                    className="min-h-[46px] max-w-full cursor-pointer rounded-[10px] border-none bg-foreground px-[18px] py-2 font-sans text-[15px] font-semibold leading-tight text-background transition-colors duration-fast ease-out hover:bg-mk-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:scale-[0.98] disabled:cursor-progress"
                >
                    {state.at === "sending" ? copy.sending : copy.submit}
                </button>
            </div>
        </form>
    );
}
