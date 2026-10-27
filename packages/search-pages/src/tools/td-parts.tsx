"use client";

import type { ReactNode, TextareaHTMLAttributes } from "react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Pieces the WhatsApp, policy and print tools share (boards genB/genC:
 * `textarea`, `check`, `doc`, `NOT_LEGAL`, `bubble`, `paper`). Light
 * cards on both desk and phone, unlike the dark `Result`. Styled under
 * `/* td: … *\/` in styles.css.
 */

/** The grey "(optional)" after a label. */
export function Opt() {
    return <span className="td-opt"> (optional)</span>;
}

export function Textarea({
    label,
    hint,
    id,
    ...area
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label: ReactNode;
    hint?: ReactNode;
}) {
    const auto = useId();
    const areaId = id ?? auto;
    return (
        <div className="tp-field">
            <label htmlFor={areaId} className="tp-label">
                {label}
            </label>
            <textarea
                id={areaId}
                aria-describedby={hint ? `${areaId}-hint` : undefined}
                className="tp-input td-area"
                {...area}
            />
            {hint ? (
                <span id={`${areaId}-hint`} className="tp-hint">
                    {hint}
                </span>
            ) : null}
        </div>
    );
}

/** A tickbox with its label, and a grey line under it. */
export function Check({
    label,
    hint,
    checked,
    onChange,
}: {
    label: ReactNode;
    hint?: ReactNode;
    checked: boolean;
    onChange: (on: boolean) => void;
}) {
    return (
        <div>
            <label className="td-check">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="td-check-box"
                />
                {label}
            </label>
            {hint ? (
                <span className="tp-hint td-check-hint">{hint}</span>
            ) : null}
        </div>
    );
}

/** A white card on the side; the email gate inside it is drawn light. */
export function Card({
    label,
    children,
}: {
    label?: string;
    children: ReactNode;
}) {
    return label ? (
        <section aria-label={label} className="td-card td-light">
            {children}
        </section>
    ) : (
        <div className="td-card td-light">{children}</div>
    );
}

/** The small capitals over a card: "Your link". */
export function Eyebrow({ children }: { children: ReactNode }) {
    return <span className="td-eyebrow">{children}</span>;
}

/** A small grey line. */
export function Small({
    children,
    status = false,
}: {
    children: ReactNode;
    status?: boolean;
}) {
    return (
        <span role={status ? "status" : undefined} className="td-small">
            {children}
        </span>
    );
}

/** A grey note (paper-coloured). */
export function Hint({ children }: { children: ReactNode }) {
    return <p className="td-note">{children}</p>;
}

export interface Para {
    head?: string;
    /** "[gaps]" in it are marked. */
    text: string;
}

/** A written policy, as a white page: title, date, then a paragraph a rule. */
export function PolicyDoc({
    title,
    sub,
    paras,
}: {
    title: string;
    sub: string;
    paras: readonly Para[];
}) {
    return (
        <article aria-label="Your policy" className="td-doc">
            <h2 className="td-doc-h">
                <Marked text={title} />
            </h2>
            <span className="td-doc-sub">{sub}</span>
            {paras.map((p, i) => (
                <p key={`${i}-${p.head ?? ""}`}>
                    {p.head ? <b>{p.head}</b> : null}
                    {p.head ? " " : null}
                    <Marked text={p.text} />
                </p>
            ))}
        </article>
    );
}

/** A gap in a written text: "[your WhatsApp or email]". */
export function Gap({ children }: { children: ReactNode }) {
    return <mark className="td-gap">{children}</mark>;
}

export function NotLegal() {
    return (
        <div role="note" className="td-notlegal">
            <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="td-notlegal-icon"
            >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16.5v.5" />
            </svg>
            <span>
                <b>Not legal advice.</b> This is a plain-language starting
                point. Read it through, change what doesn&apos;t fit your
                business, and ask a lawyer if you are unsure.
            </span>
        </div>
    );
}

/** A chat bubble: green for a message they send, sand for one they get. */
export function Bubble({
    children,
    green = false,
}: {
    children: ReactNode;
    green?: boolean;
}) {
    return (
        <div className={green ? "td-bubble td-bubble-green" : "td-bubble"}>
            {children}
        </div>
    );
}

/** The sand sheet a printed thing lies on, with its caption. */
export function Paper({
    label,
    caption,
    children,
}: {
    label: string;
    caption: ReactNode;
    children: ReactNode;
}) {
    return (
        <section aria-label={label} className="td-paper">
            {children}
            <span className="td-paper-cap">{caption}</span>
        </section>
    );
}

/**
 * Copies `text` and says so on the button for a few seconds. Returns
 * whether it just copied, and the click handler.
 */
export function useCopy(text: string) {
    // What was copied: a change to the text since puts the button back.
    const [copiedText, setCopiedText] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            return;
        }
        setCopiedText(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopiedText(null), 4000);
    }
    return { copied: copiedText === text, copy: () => void copy() };
}

/** A print button: the page's print CSS prints only the tool's sheet. */
export function PrintButton({ children }: { children: ReactNode }) {
    return (
        <button
            type="button"
            className="tp-btn tp-btn-wide"
            onClick={() => window.print()}
        >
            {children}
        </button>
    );
}

/** Text with its "[gaps]" marked, as the boards draw a gap still to fill. */
export function Marked({ text }: { text: string }) {
    return (
        <>
            {text
                .split(/(\[[^\]]+\])/)
                .map((part, i) =>
                    i % 2 ? <Gap key={`${i}-${part}`}>{part}</Gap> : part,
                )}
        </>
    );
}
