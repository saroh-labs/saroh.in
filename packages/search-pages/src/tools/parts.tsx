"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

/**
 * The pieces every tool board draws (`~/.saroh-design-drafts/tools-all/
 * tools/genA/lib.py`, the batch-1 GstCalculator boards): the form, a
 * field, a row of choice chips, the result and its notes. Styled by
 * `src/styles.css` (`.tp-*`): on a desk the form is a white card and the
 * result is dark, on a phone (below 900px) the form is bare and the result
 * white, as the boards draw them. A tool adds only what is its own.
 */

/** The tool's two columns on a desk: the form, then what it works out (`ToolSide`). Stacked on a phone. */
export function ToolColumns({ children }: { children: ReactNode }) {
    return <section className="tp-tool">{children}</section>;
}

/** The inputs. It never submits: tools work out as they're typed into. */
export function ToolForm({
    label,
    children,
}: {
    /** What the form is, for a screen reader. */
    label: string;
    children: ReactNode;
}) {
    return (
        <form
            aria-label={label}
            noValidate
            className="tp-form"
            onSubmit={(event) => event.preventDefault()}
        >
            {children}
        </form>
    );
}

/** The column beside the form: the result, and anything under it. */
export function ToolSide({ children }: { children: ReactNode }) {
    return <div className="tp-side">{children}</div>;
}

export interface FieldProps extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "prefix"
> {
    label: string;
    /** The grey line under the field. */
    hint?: ReactNode;
    /** What's wrong, in place of the hint. */
    error?: string | null;
    /** Drawn inside the field, before the value: "₹". */
    prefix?: string;
    /** Drawn inside the field, after the value: "%". */
    suffix?: string;
}

/** A labelled input with its hint, or its error once it has one. */
export function Field({
    label,
    hint,
    error,
    prefix,
    suffix,
    id,
    className,
    ...input
}: FieldProps) {
    const auto = useId();
    const inputId = id ?? auto;
    const said = error ? `${inputId}-error` : hint ? `${inputId}-hint` : "";
    const box = (
        <input
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={said || undefined}
            className={`tp-input ${prefix ? "tp-input-pre" : ""} ${suffix ? "tp-input-suf" : ""} ${className ?? ""}`}
            {...input}
        />
    );
    return (
        <div className="tp-field">
            <label htmlFor={inputId} className="tp-label">
                {label}
            </label>
            {prefix || suffix ? (
                <div className="tp-affix">
                    {prefix ? (
                        <span aria-hidden="true" className="tp-pre">
                            {prefix}
                        </span>
                    ) : null}
                    {box}
                    {suffix ? (
                        <span aria-hidden="true" className="tp-suf">
                            {suffix}
                        </span>
                    ) : null}
                </div>
            ) : (
                box
            )}
            {error ? (
                <span id={said} role="alert" className="tp-error">
                    {error}
                </span>
            ) : hint ? (
                <span id={said} className="tp-hint">
                    {hint}
                </span>
            ) : null}
        </div>
    );
}

/** One choice of several, as a row of chips (radio buttons underneath). */
export function Chips<T extends string>({
    legend,
    options,
    value,
    onChange,
    hint,
}: {
    legend: string;
    options: readonly { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    hint?: ReactNode;
}) {
    const name = useId();
    return (
        <fieldset className="tp-chips">
            <legend className="tp-label">{legend}</legend>
            <div className="tp-chip-row">
                {options.map((o) => (
                    <label
                        key={o.value}
                        className={`tp-chip ${o.value === value ? "tp-chip-on" : ""}`}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={o.value}
                            checked={o.value === value}
                            onChange={() => onChange(o.value)}
                            className="tp-chip-input"
                        />
                        {o.label}
                    </label>
                ))}
            </div>
            {hint ? (
                <span className="tp-hint tp-chips-hint">{hint}</span>
            ) : null}
        </fieldset>
    );
}

export interface ResultRow {
    k: string;
    v: string;
    /** The last, ruled-off line ("Lost a year"). */
    total?: boolean;
}

/**
 * What the tool worked out: the big figure and its label, the rows, then
 * `children` (notes, the email gate). `figure` null draws only the rows.
 */
export function Result({
    figureLabel,
    figure,
    rows = [],
    children,
    label = "Result",
}: {
    figureLabel?: ReactNode;
    figure?: string | null;
    rows?: readonly ResultRow[];
    children?: ReactNode;
    /** The eyebrow, and the section's name for a screen reader. */
    label?: string;
}) {
    return (
        <section aria-label={label} className="tp-result">
            <span className="tp-eyebrow">{label}</span>
            {figure ? (
                <div className="tp-figure">
                    <span className="tp-figure-label">{figureLabel}</span>
                    <span aria-live="polite" className="tp-figure-value">
                        {figure}
                    </span>
                </div>
            ) : null}
            {rows.length ? (
                <dl className="tp-rows">
                    {rows.map((r) => (
                        <div
                            key={r.k}
                            className={`tp-row ${r.total ? "tp-row-total" : ""}`}
                        >
                            <dt>{r.k}</dt>
                            <dd>{r.v}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
            {children}
        </section>
    );
}

/** No result yet: what the tool needs, never ₹0. */
export function ResultEmpty({
    children,
    label = "Result",
}: {
    children: ReactNode;
    label?: string;
}) {
    return (
        <section aria-label={label} className="tp-result tp-result-empty">
            <span className="tp-eyebrow">{label}</span>
            <p aria-live="polite" className="tp-empty">
                {children}
            </p>
        </section>
    );
}

/** A short note in the result: what the numbers mean, or why they're held. */
export function Note({ children }: { children: ReactNode }) {
    return <p className="tp-note">{children}</p>;
}
