"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { CHANGELOG } from "@/content/changelog";
import { cn } from "@/lib/cn";
import type { WaitlistResponse } from "@/lib/waitlist";
import { WAITLIST_MESSAGES } from "@/lib/waitlist";

/** The waitlist's own email check, so this field refuses what that one does. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATE_LIMITED = "Too many tries from here. Wait a minute, then try again.";
const FAILED = "We couldn't add you just now. Try again in a minute.";

type State =
    | { at: "idle" | "sending" }
    | { at: "done" }
    | { at: "error"; message: string; field: boolean };

/**
 * "Get one email when something ships" (plan U4, KTD-5): one email field
 * that joins the waitlist's list through `/api/waitlist`, marked
 * `source=changelog`. Joining twice with the same address is not an error:
 * both say the same thing, so the page never tells anyone whether an
 * address was already listed.
 */
export function ChangelogSignup() {
    const [email, setEmail] = useState("");
    const [state, setState] = useState<State>({ at: "idle" });

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const value = email.trim();
        if (!EMAIL.test(value) || value.length > 320) {
            setState({
                at: "error",
                message: WAITLIST_MESSAGES.email,
                field: true,
            });
            return;
        }
        setState({ at: "sending" });
        try {
            const res = await fetch("/api/waitlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: value, src: "changelog" }),
            });
            const body = (await res.json()) as WaitlistResponse;
            if (body.status === "success") {
                setState({ at: "done" });
                return;
            }
            const code = body.reason?.code;
            setState(
                code === "INVALID"
                    ? {
                          at: "error",
                          message: WAITLIST_MESSAGES.email,
                          field: true,
                      }
                    : {
                          at: "error",
                          message:
                              code === "RATE_LIMITED" ? RATE_LIMITED : FAILED,
                          field: false,
                      },
            );
        } catch {
            setState({
                at: "error",
                message: FAILED,
                field: false,
            });
        }
    };

    if (state.at === "done") {
        return (
            <p
                role="status"
                className="m-0 max-w-[520px] rounded-[10px] border border-border bg-card px-4 py-3 text-[15px] leading-[1.55] text-foreground"
            >
                {CHANGELOG.signupDone}
            </p>
        );
    }

    const fieldError = state.at === "error" && state.field;
    return (
        <form
            noValidate
            onSubmit={onSubmit}
            aria-label="Changelog email"
            className="grid max-w-[520px] gap-2"
        >
            <div className="flex flex-wrap gap-2">
                <label htmlFor="changelog-email" className="sr-only">
                    Email
                </label>
                <input
                    id="changelog-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@yourbusiness.in"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        if (state.at === "error") setState({ at: "idle" });
                    }}
                    aria-invalid={fieldError || undefined}
                    aria-describedby={
                        state.at === "error"
                            ? "changelog-email-error changelog-email-note"
                            : "changelog-email-note"
                    }
                    className={cn(
                        "h-[46px] min-w-0 flex-[1_1_240px] rounded-[10px] border bg-white px-3.5 font-sans text-[15px] text-foreground transition-colors duration-fast ease-out placeholder:text-muted-foreground hover:border-foreground focus:ring-0 focus:ring-offset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]",
                        fieldError
                            ? "border-destructive"
                            : "border-border-strong",
                    )}
                />
                <button
                    type="submit"
                    disabled={state.at === "sending"}
                    className="min-h-[46px] max-w-full cursor-pointer rounded-[10px] border-none bg-foreground px-[18px] py-2 font-sans text-[15px] font-semibold leading-tight text-background transition-colors duration-fast ease-out hover:bg-mk-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:scale-[0.98] disabled:cursor-progress"
                >
                    {state.at === "sending"
                        ? "Adding you…"
                        : CHANGELOG.signupLabel}
                </button>
            </div>
            {state.at === "error" ? (
                <p
                    id="changelog-email-error"
                    role="alert"
                    className="m-0 text-[14px] font-medium text-destructive"
                >
                    {state.message}
                </p>
            ) : null}
            <p
                id="changelog-email-note"
                className="m-0 text-mk-note leading-[1.5] text-muted-foreground"
            >
                {CHANGELOG.signupNote}
            </p>
        </form>
    );
}
