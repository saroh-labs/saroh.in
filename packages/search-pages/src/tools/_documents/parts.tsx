"use client";

import type { ReactNode } from "react";
import { useId, useState, useSyncExternalStore } from "react";

import { EmailGate } from "../email-gate";
import { Field } from "../parts";
import type { LineInput, Parties, Sum } from "./logic";
import {
    emptyLine,
    GST_RATES,
    gstinProblem,
    lineProblems,
    readDate,
    showDate,
    STATES,
    today,
} from "./logic";

/**
 * The four document makers' pieces (boards `GstInvoice*`, `BillOfSupply*`,
 * `ReceiptMaker*`, `Quotation*`, their generator `genA/lib.py`): the form
 * in white fieldsets beside a sticky paper preview on a desk; stacked on a
 * phone, the preview under "Your …". Styled by `.td-*` in styles.css
 * (under `_documents`). Printing prints the paper only.
 */

/** The form, then the preview (`children`) with what's under it and the gate. */
export function DocTool({
    form,
    formLabel,
    label,
    children,
}: {
    form: ReactNode;
    formLabel: string;
    /** "Your invoice": the aside's name, and its heading on a phone. */
    label: string;
    children: ReactNode;
}) {
    return (
        <section className="tp-tool td">
            <form
                aria-label={formLabel}
                noValidate
                className="td-form"
                onSubmit={(event) => event.preventDefault()}
            >
                {form}
            </form>
            <aside aria-label={label} className="td-aside">
                <h2 className="td-aside-h">{label}</h2>
                {children}
            </aside>
        </section>
    );
}

/** A white fieldset with its legend; `cols` lays the fields out on a desk. */
export function DocSet({
    legend,
    cols,
    children,
}: {
    legend: string;
    cols?: 2 | 3;
    children: ReactNode;
}) {
    return (
        <fieldset className="td-set">
            <legend>{legend}</legend>
            {cols ? (
                <div className={`td-grid ${cols === 2 ? "td-grid-2" : ""}`}>
                    {children}
                </div>
            ) : (
                children
            )}
        </fieldset>
    );
}

/** A labelled select, styled as the inputs. */
export function DocSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: readonly (readonly [string, string])[];
}) {
    const id = useId();
    return (
        <div className="tp-field">
            <label htmlFor={id} className="tp-label">
                {label}
            </label>
            <select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="tp-input"
            >
                {options.map(([v, l]) => (
                    <option key={v} value={v}>
                        {l}
                    </option>
                ))}
            </select>
        </div>
    );
}

export const STATE_OPTIONS = STATES.map(([c, n]) => [c, n] as const);
const RATE_OPTIONS = GST_RATES.map((r) => [r, `${r}%`] as const);

/** The small amber "[to confirm]" on a tax fact. */
export function Tc() {
    return <span className="td-tc">[to confirm]</span>;
}

const LINE_BAD = {
    qty: "Type the quantity as a number, like 1 or 2.5.",
    rate: "Type the rate in rupees, like 1500 or 1500.50.",
} as const;

/**
 * The lines: a grid with column heads on a desk, a card each on a phone.
 * `gst` adds the rate column, `codes` the HSN/SAC one. A number that
 * can't be read is marked when they leave it; that line drops out of the
 * preview until it's fixed. A line left empty is simply not on the bill.
 */
export function LinesEditor({
    lines,
    onChange,
    gst = false,
    codes = true,
    placeholder,
}: {
    lines: readonly LineInput[];
    onChange: (lines: LineInput[]) => void;
    gst?: boolean;
    codes?: boolean;
    placeholder: { item: string; code?: string; rate: string };
}) {
    const [left, setLeft] = useState<Set<string>>(new Set());
    const set = (i: number, key: keyof LineInput, value: string) =>
        onChange(lines.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
    const leave = (k: string) => () => setLeft((was) => new Set(was).add(k));
    const bad = lines.flatMap((l, i) =>
        lineProblems(l)
            .filter((p) => left.has(`${i}:${p}`))
            .map((p) => ({ i, p })),
    );
    const isBad = (i: number, p: "qty" | "rate") =>
        bad.some((b) => b.i === i && b.p === p) ? true : undefined;
    const kind = `${codes ? "td-lines-code" : ""} ${gst ? "td-lines-gst" : ""}`;
    return (
        <>
            <div className={`td-lines ${kind}`}>
                <span className="td-head">Item</span>
                {codes ? <span className="td-head">HSN/SAC</span> : null}
                <span className="td-head">Qty</span>
                <span className="td-head">Rate (₹)</span>
                {gst ? <span className="td-head">GST</span> : null}
                {lines.map((l, i) => (
                    <div key={i} className="td-line">
                        <input
                            aria-label="Item"
                            value={l.item}
                            placeholder={placeholder.item}
                            onChange={(e) => set(i, "item", e.target.value)}
                            className="tp-input td-item-in"
                        />
                        {codes ? (
                            <input
                                aria-label="HSN or SAC"
                                inputMode="numeric"
                                value={l.code}
                                placeholder={placeholder.code}
                                onChange={(e) => set(i, "code", e.target.value)}
                                className="tp-input td-mono td-code-in"
                            />
                        ) : null}
                        <input
                            aria-label="Quantity"
                            inputMode="decimal"
                            value={l.qty}
                            aria-invalid={isBad(i, "qty")}
                            onChange={(e) => set(i, "qty", e.target.value)}
                            onBlur={leave(`${i}:qty`)}
                            className="tp-input"
                        />
                        <input
                            aria-label="Rate in rupees"
                            inputMode="decimal"
                            value={l.rate}
                            placeholder={placeholder.rate}
                            aria-invalid={isBad(i, "rate")}
                            onChange={(e) => set(i, "rate", e.target.value)}
                            onBlur={leave(`${i}:rate`)}
                            className="tp-input"
                        />
                        {gst ? (
                            <select
                                aria-label="GST rate"
                                value={l.gst}
                                onChange={(e) => set(i, "gst", e.target.value)}
                                className="tp-input td-gst-in"
                            >
                                {RATE_OPTIONS.map(([v, t]) => (
                                    <option key={v} value={v}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        ) : null}
                    </div>
                ))}
            </div>
            {bad[0] ? (
                <span role="alert" className="tp-error">
                    {LINE_BAD[bad[0].p]}
                </span>
            ) : null}
            <button
                type="button"
                className="tp-btn td-btn2 td-add"
                onClick={() =>
                    onChange([...lines, emptyLine(lines.at(-1)?.gst)])
                }
            >
                + Add a line
            </button>
        </>
    );
}

export interface PaperProps {
    title: string;
    sub: string;
    num: string;
    billed: string;
    items: readonly Sum[];
    sums: readonly Sum[];
    total: Sum;
    /** Under the total: the amount in words, the declaration, what's due. */
    children?: ReactNode;
}

/** The document as it prints: the white paper card. */
export function Paper({
    title,
    sub,
    num,
    billed,
    items,
    sums,
    total,
    children,
}: PaperProps) {
    return (
        <div className="td-paper">
            <div className="td-top">
                <div className="td-who">
                    <span className="td-title">{title}</span>
                    {sub ? <span className="td-sub">{sub}</span> : null}
                </div>
                <span className="td-num">{num}</span>
            </div>
            <div className="td-billed">{billed}</div>
            {items.map((l, i) => (
                <div key={`${i}-${l.k}`} className="td-it">
                    <span>{l.k}</span>
                    <span className="td-amt">{l.v}</span>
                </div>
            ))}
            <dl className="td-sums">
                {sums.map((s) => (
                    <div key={s.k} className="td-sum">
                        <dt>{s.k}</dt>
                        <dd>{s.v}</dd>
                    </div>
                ))}
                <div className="td-sum td-total">
                    <dt>{total.k}</dt>
                    <dd>{total.v}</dd>
                </div>
            </dl>
            {children}
        </div>
    );
}

/** Nothing typed yet: where the document will be. */
export function PaperEmpty({ children }: { children: ReactNode }) {
    return (
        <div className="td-paper">
            <p aria-live="polite" className="td-paper-empty">
                {children}
            </p>
        </div>
    );
}

/** A grey note: on the paper (a declaration), or under it (a held value). */
export function DocNote({ children }: { children: ReactNode }) {
    return <div className="td-note">{children}</div>;
}

/** The grey line under the preview. */
export function Small({ children }: { children: ReactNode }) {
    return <span className="td-small">{children}</span>;
}

/** Print with `name` as the page title, so "save as PDF" offers INV-0001.pdf. */
function printAs(name: string) {
    const was = document.title;
    document.title = name;
    window.print();
    document.title = was;
}

/**
 * The email gate on the PDF (owner D2: the document shows free, the file
 * asks for an email), then Print or save as PDF, and a WhatsApp link when
 * the maker has one (`share`, a wa.me address with the message).
 */
export function DocGate({
    what,
    file,
    share,
    shareLabel,
}: {
    /** "invoice": "Get your invoice as a PDF". */
    what: string;
    /** The PDF's name, without .pdf. */
    file: string;
    share?: string;
    shareLabel?: string;
}) {
    return (
        <EmailGate
            label={`Get your ${what} as a PDF`}
            button="Email me the PDF"
            sentLine={`Print it or save it as a PDF here. Your ${what} stays filled in on this device when you come back from the email.`}
        >
            <button
                type="button"
                className="tp-btn tp-btn-wide"
                onClick={() => printAs(file || what)}
            >
                Print or save as PDF
            </button>
            {share ? (
                <a
                    href={share}
                    target="_blank"
                    rel="noreferrer"
                    className="tp-btn td-btn2 td-share"
                >
                    {shareLabel}
                </a>
            ) : null}
        </EmailGate>
    );
}

/** The saved draft's text; null on the server, in the first draw and without storage. */
function readSaved(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

const onStorage = (changed: () => void) => {
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
};

/**
 * The form, kept in this browser (localStorage) so the link in the gate's
 * email brings them back to it filled in. Nothing is sent anywhere. Read
 * as an external store, so the server's and the browser's first draws
 * match; what they type wins over what was saved.
 */
export function useDraft<T extends object>(
    key: string,
    start: T,
): [T, (next: T) => void] {
    const saved = useSyncExternalStore(
        onStorage,
        () => readSaved(key),
        () => null,
    );
    const [typed, setTyped] = useState<T | null>(null);
    let value = typed ?? start;
    if (!typed && saved) {
        try {
            value = { ...start, ...(JSON.parse(saved) as T) };
        } catch {
            // A draft we can't read: start empty.
        }
    }
    const set = (next: T) => {
        setTyped(next);
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch {
            // Not kept; the form still works.
        }
    };
    return [value, set];
}

/** The document's number: up to 16 characters (GST's limit), checked when they leave it. */
export function DocNumber({
    label,
    value,
    placeholder,
    hint,
    onChange,
}: {
    label: string;
    value: string;
    placeholder: string;
    hint?: ReactNode;
    onChange: (value: string) => void;
}) {
    const [left, setLeft] = useState(false);
    const n = value.trim().length;
    return (
        <Field
            label={label}
            value={value}
            placeholder={placeholder}
            hint={hint}
            error={
                left && n > 16
                    ? `Up to 16 characters. This one has ${n}.`
                    : null
            }
            className="td-mono"
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setLeft(true)}
        />
    );
}

/** A GSTIN field: capitals as typed, checked when they leave it; a good one sets the state. */
function GstinField({
    label,
    value,
    hint,
    onChange,
}: {
    label: string;
    value: string;
    hint?: ReactNode;
    onChange: (gstin: string, state: string | null) => void;
}) {
    const [left, setLeft] = useState(false);
    const problem = left ? gstinProblem(value) : null;
    return (
        <Field
            label={label}
            value={value}
            autoCapitalize="characters"
            spellCheck={false}
            hint={hint}
            error={problem}
            className="td-mono"
            onChange={(e) => {
                const g = e.target.value.toUpperCase();
                onChange(
                    g,
                    g.trim() && !gstinProblem(g) ? g.slice(0, 2) : null,
                );
            }}
            onBlur={() => setLeft(true)}
        />
    );
}

/** "You": business name, GSTIN, state, then the address across. */
export function YouSet({
    v,
    set,
    gstinHint,
}: {
    v: Parties;
    set: (patch: Partial<Parties>) => void;
    gstinHint: string;
}) {
    return (
        <DocSet legend="You" cols={3}>
            <Field
                label="Business name"
                value={v.name}
                placeholder="Your business"
                autoComplete="organization"
                onChange={(e) => set({ name: e.target.value })}
            />
            <GstinField
                label="GSTIN"
                value={v.gstin}
                hint={gstinHint}
                onChange={(gstin, state) =>
                    set(state ? { gstin, state } : { gstin })
                }
            />
            <DocSelect
                label="State"
                value={v.state}
                onChange={(state) => set({ state })}
                options={STATE_OPTIONS}
            />
            <div className="td-wide">
                <Field
                    label="Address"
                    value={v.address}
                    placeholder="Area, city"
                    onChange={(e) => set({ address: e.target.value })}
                />
            </div>
        </DocSet>
    );
}

/** "Customer": name, GSTIN if they have one, state (the place of supply). */
export function CustomerSet({
    v,
    set,
}: {
    v: Parties;
    set: (patch: Partial<Parties>) => void;
}) {
    return (
        <DocSet legend="Customer" cols={3}>
            <Field
                label="Name"
                value={v.customer}
                placeholder="Customer's name"
                onChange={(e) => set({ customer: e.target.value })}
            />
            <GstinField
                label="GSTIN (if they have one)"
                value={v.customerGstin}
                onChange={(customerGstin, customerState) =>
                    set(
                        customerState
                            ? { customerGstin, customerState }
                            : { customerGstin },
                    )
                }
            />
            <DocSelect
                label="State"
                value={v.customerState}
                onChange={(customerState) => set({ customerState })}
                options={STATE_OPTIONS}
            />
        </DocSet>
    );
}

/** A date typed as text ("26 Oct 2026"), checked when they leave it; empty is today. */
export function DocDate({
    label,
    value,
    onChange,
    placeholder = showDate(today()),
    hint,
    error,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    hint?: ReactNode;
    /** A problem the maker finds (a valid-until too early); shown once they've left the field. */
    error?: string | null;
}) {
    const [left, setLeft] = useState(false);
    const own =
        value.trim() && !readDate(value)
            ? `Type a date like ${placeholder}.`
            : null;
    return (
        <Field
            label={label}
            value={value}
            placeholder={placeholder}
            hint={hint}
            error={left ? (own ?? error ?? null) : null}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setLeft(true)}
        />
    );
}
