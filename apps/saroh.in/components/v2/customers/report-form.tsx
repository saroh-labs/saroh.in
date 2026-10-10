"use client";

import type { FormEvent } from "react";
import { useState, useSyncExternalStore } from "react";

import { CUSTOMERS } from "@/content/customers";
import type { ReportResult } from "@/lib/business-report";
import {
    prefilledSite,
    REPORT_LIMITS,
    reportProblem,
} from "@/lib/business-report";
import { cn } from "@/lib/cn";

const copy = CUSTOMERS.form;

type Field = "site" | "message" | "email";

type State =
    | { at: "idle" | "sending" | "done" }
    | { at: "error"; message: string; field: Field | null };

const FIELD_MESSAGE: Record<Field, string> = {
    site: copy.badSite,
    message: copy.shortMessage,
    email: copy.badEmail,
};

/** The address in the URL doesn't change while the page is open. */
const noChange = () => () => undefined;

const INPUT =
    "min-w-0 rounded-[10px] border bg-white px-3.5 font-sans text-[15px] text-foreground transition-colors duration-fast ease-out placeholder:text-muted-foreground hover:border-foreground focus:ring-0 focus:ring-offset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

/**
 * Report a business (/customers, Terms rev 46): the site's address, what
 * happened, and an email only if they want a reply. Posts to
 * `/api/business-reports`. A Free merchant site's "Report" link
 * fills the address in from `?site=`, read in the browser so the page stays
 * static. The answer is the same whether or not the address is a Saroh
 * site.
 */
export function ReportForm() {
    // The link's address until they type their own: read in the browser
    // (the server draws the field empty), so the page stays static.
    const given = useSyncExternalStore(
        noChange,
        () => prefilledSite(window.location.search),
        () => "",
    );
    const [typed, setSite] = useState<string | null>(null);
    const site = typed ?? given;
    const [message, setMessage] = useState("");
    const [email, setEmail] = useState("");
    const [state, setState] = useState<State>({ at: "idle" });

    const clear = () => {
        if (state.at === "error") setState({ at: "idle" });
    };

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const problem = reportProblem({ site, message, email });
        if (problem) {
            setState({
                at: "error",
                message: FIELD_MESSAGE[problem],
                field: problem,
            });
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
                    ...(email.trim() ? { email: email.trim() } : {}),
                }),
            });
            const body = (await res.json()) as ReportResult;
            if (body.sent) {
                setState({ at: "done" });
                return;
            }
            const failure = body.failure;
            setState(
                failure === "site" ||
                    failure === "message" ||
                    failure === "email"
                    ? {
                          at: "error",
                          message: FIELD_MESSAGE[failure],
                          field: failure,
                      }
                    : {
                          at: "error",
                          message:
                              failure === "rate-limited"
                                  ? copy.rateLimited
                                  : copy.failed,
                          field: null,
                      },
            );
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
                    id="report-site"
                    name="site"
                    type="text"
                    inputMode="url"
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
                    id="report-message"
                    name="message"
                    rows={5}
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
                    id="report-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
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
