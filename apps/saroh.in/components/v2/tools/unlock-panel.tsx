"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { linkPreview as copy } from "@/content/link-preview";
import type { UnlockResult } from "@/lib/link-preview";

export type Unlocked = Extract<UnlockResult, { unlocked: true }>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The dark panel (design 1b, the email version, KTD-5): locked, it asks
 * for an email and the news tickbox; unlocked, it lists the fixes from the
 * API's report and the tags to copy.
 */
export function UnlockPanel({
    unlocked,
    pending,
    error,
    onUnlock,
}: {
    unlocked: Unlocked | null;
    pending: boolean;
    error: string | null;
    onUnlock: (input: { email: string; consent: boolean }) => void;
}) {
    const [email, setEmail] = useState("");
    const [consent, setConsent] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const errorId = useId();
    const shown = invalid ? copy.badEmail : error;

    if (unlocked) {
        return (
            <section
                aria-labelledby="fixes-title"
                className="grid gap-3 rounded-2xl bg-foreground p-5 text-background"
            >
                <h2 id="fixes-title" className="m-0 text-base font-semibold">
                    {copy.fixTitle(unlocked.fixes.length)}
                </h2>
                <p
                    role="status"
                    className="m-0 text-[12.5px] text-mk-on-ink-muted"
                >
                    {copy.emailed[unlocked.emailed]}
                </p>
                <ol className="m-0 grid list-none gap-3 p-0">
                    {unlocked.fixes.map((fix) => (
                        <li
                            key={fix.key}
                            className="grid gap-[3px] border-t border-mk-ink-hover pt-2.5"
                        >
                            <span className="text-sm font-semibold text-mk-saffron">
                                {fix.title}
                            </span>
                            <span className="text-[13px] leading-[1.5] text-mk-on-ink">
                                {fix.body}
                            </span>
                        </li>
                    ))}
                </ol>
                <span className="text-[12.5px] text-mk-on-ink-muted">
                    {copy.tagsTitle}
                </span>
                <pre
                    tabIndex={0}
                    aria-label={copy.tagsTitle}
                    className="m-0 overflow-x-auto whitespace-pre-wrap rounded-lg bg-mk-on-ink-hover p-3 font-mono text-[11px] leading-[1.6] text-mk-code [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-background focus-visible:[outline-style:solid]"
                >
                    {unlocked.suggestedTags}
                </pre>
            </section>
        );
    }

    return (
        <section
            aria-labelledby="unlock-title"
            className="grid gap-3 rounded-2xl bg-foreground p-5 text-background"
        >
            <h2 id="unlock-title" className="m-0 text-base font-semibold">
                {copy.lockedTitle}
            </h2>
            <p className="m-0 text-[13.5px] leading-[1.5] text-mk-on-ink">
                {copy.lockedBody}
            </p>
            <form
                noValidate
                className="grid gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    const value = email.trim();
                    if (!EMAIL.test(value)) {
                        setInvalid(true);
                        return;
                    }
                    setInvalid(false);
                    onUnlock({ email: value, consent });
                }}
            >
                <input
                    type="email"
                    autoComplete="email"
                    placeholder={copy.emailPlaceholder}
                    aria-label="Email"
                    aria-invalid={shown ? true : undefined}
                    aria-describedby={shown ? errorId : undefined}
                    value={email}
                    onChange={(event) => {
                        setEmail(event.target.value);
                        if (invalid) setInvalid(false);
                    }}
                    className="h-11 rounded-[9px] border-none bg-card px-3.5 text-[15px] text-foreground placeholder:text-mk-hint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mk-saffron focus-visible:[outline-style:solid]"
                />
                <button
                    type="submit"
                    disabled={pending}
                    className="h-11 cursor-pointer rounded-[9px] border-none bg-mk-saffron font-semibold text-foreground transition-colors duration-fast ease-out hover:bg-mk-saffron-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background focus-visible:[outline-style:solid] active:bg-brand-400 disabled:cursor-progress"
                >
                    {pending ? copy.unlocking : copy.unlock}
                </button>
                {shown ? (
                    <span
                        id={errorId}
                        role="alert"
                        className="text-[12.5px] text-mk-on-ink-accent"
                    >
                        {shown}
                    </span>
                ) : null}
            </form>
            <label className="flex cursor-pointer items-start gap-2 text-[12.5px] leading-[1.45] text-mk-on-ink">
                <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-mk-saffron"
                />
                {copy.consent}
            </label>
            <span className="text-xs text-mk-on-ink-muted">
                {copy.promise}{" "}
                <Link
                    href="/privacy"
                    className="text-mk-saffron underline underline-offset-2 hover:text-mk-saffron-hover active:text-mk-on-ink"
                >
                    {copy.privacy}
                </Link>
            </span>
        </section>
    );
}
