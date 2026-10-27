"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { qrCodeMaker as copy } from "@/content/qr-code-maker";
import type { QrUnlockResult } from "@/lib/qr-code-maker";
import { EMAIL_SHAPE } from "@/lib/qr-code-maker";

export type QrUnlocked = Extract<QrUnlockResult, { unlocked: true }>;

const FOCUS =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

/** The design's 44px button; each fill below adds its own colours. */
const BUTTON = `h-11 rounded-[10px] px-[18px] text-[15px] font-semibold transition-colors duration-fast ease-out ${FOCUS}`;
const INK_BUTTON = `${BUTTON} cursor-pointer border-none bg-foreground text-background hover:bg-mk-ink-hover active:bg-mk-on-ink-hover`;
const OUTLINE_BUTTON = `${BUTTON} cursor-pointer border border-border-strong bg-card text-foreground hover:bg-mk-hover active:bg-muted`;
/** Nothing to download yet: the one disabled treatment, with the reason beside it. */
const OFF_BUTTON = `${BUTTON} cursor-not-allowed border-none bg-disabled text-disabled-foreground`;

/**
 * Under the code (design 02): the email gate, then the downloads it
 * unlocks. The email is the only thing the page sends to Saroh; the files
 * are made here, in the browser (`qr-download.ts`). No news tickbox: an
 * address typed into a public tool isn't verified, so it can't say yes to
 * marketing.
 */
export function QrMakerGate({
    unlocked,
    pending,
    error,
    onUnlock,
    blocked,
    pngError,
    onPng,
    onSvg,
}: {
    unlocked: QrUnlocked | null;
    pending: boolean;
    /** The server's answer, in the page's words, when it wasn't a yes. */
    error: string | null;
    onUnlock: (email: string) => void;
    /** Why there is nothing to download yet ("" when the page says so elsewhere), or null. */
    blocked: string | null;
    pngError: string | null;
    onPng: () => void;
    onSvg: () => void;
}) {
    const [email, setEmail] = useState("");
    const [invalid, setInvalid] = useState(false);
    const errorId = useId();
    const blockedId = useId();
    const shown = invalid ? copy.gate.badEmail : error;

    if (unlocked) {
        const off = blocked !== null;
        return (
            <div className="grid w-full justify-items-center gap-2 border-t border-mk-line-row pt-4">
                <div className="flex flex-wrap justify-center gap-2">
                    <button
                        type="button"
                        aria-disabled={off || undefined}
                        aria-describedby={blocked ? blockedId : undefined}
                        onClick={off ? undefined : onPng}
                        className={off ? OFF_BUTTON : INK_BUTTON}
                    >
                        {copy.downloads.png}
                    </button>
                    <button
                        type="button"
                        aria-label={copy.downloads.svgName}
                        aria-disabled={off || undefined}
                        aria-describedby={blocked ? blockedId : undefined}
                        onClick={off ? undefined : onSvg}
                        className={off ? OFF_BUTTON : OUTLINE_BUTTON}
                    >
                        {copy.downloads.svg}
                    </button>
                </div>
                {blocked ? (
                    <span
                        id={blockedId}
                        className="text-center text-[13px] text-muted-foreground"
                    >
                        {blocked}
                    </span>
                ) : null}
                {pngError ? (
                    <span
                        role="alert"
                        className="text-center text-[13px] text-mk-bad"
                    >
                        {pngError}
                    </span>
                ) : null}
                <span
                    role="status"
                    className="text-center text-[12.5px] text-muted-foreground"
                >
                    {copy.downloads.emailed[unlocked.emailed]}
                </span>
            </div>
        );
    }

    return (
        <form
            noValidate
            aria-labelledby={`${errorId}-title`}
            className="flex w-full flex-col gap-2 border-t border-mk-line-row pt-4"
            onSubmit={(event) => {
                event.preventDefault();
                const value = email.trim();
                if (!EMAIL_SHAPE.test(value)) {
                    setInvalid(true);
                    return;
                }
                setInvalid(false);
                onUnlock(value);
            }}
        >
            <span id={`${errorId}-title`} className="text-sm font-semibold">
                {copy.gate.title}
            </span>
            <div className="flex flex-wrap gap-2">
                <input
                    type="email"
                    autoComplete="email"
                    placeholder={copy.gate.emailPlaceholder}
                    aria-label={copy.gate.emailField}
                    aria-invalid={shown ? true : undefined}
                    aria-describedby={shown ? errorId : undefined}
                    value={email}
                    onChange={(event) => {
                        setEmail(event.target.value);
                        if (invalid) setInvalid(false);
                    }}
                    className={`h-11 min-w-0 flex-[1_1_180px] rounded-[10px] border border-border-strong bg-card px-3 text-[15px] text-foreground placeholder:text-mk-hint ${FOCUS}`}
                />
                <button
                    type="submit"
                    disabled={pending}
                    className={`${INK_BUTTON} disabled:cursor-progress`}
                >
                    {pending ? copy.gate.submitting : copy.gate.submit}
                </button>
            </div>
            {shown ? (
                <span
                    id={errorId}
                    role="alert"
                    className="text-[13px] text-mk-bad"
                >
                    {shown}
                </span>
            ) : null}
            <span className="text-[12.5px] text-muted-foreground">
                {copy.gate.note}{" "}
                <Link
                    href="/privacy"
                    className="text-brand-700 underline underline-offset-2 hover:text-foreground active:text-muted-foreground"
                >
                    {copy.gate.privacy}
                </Link>
            </span>
        </form>
    );
}
