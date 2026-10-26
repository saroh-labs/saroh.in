"use client";

import { useId, useState } from "react";

import { downloadCsv } from "../download";
import { EmailGate } from "../email-gate";
import {
    Chips,
    Field,
    Note,
    Result,
    ResultEmpty,
    ToolColumns,
    ToolForm,
    ToolSide,
} from "../parts";
import { ToConfirm } from "../to-confirm";
import type { CheckRow, Mode } from "./logic";
import { checkGstin, checkList, listCsv, MODES, WORDS } from "./logic";

function Mark({ ok, size = 16 }: { ok: boolean; size?: number }) {
    return (
        <svg
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className="gc-mark"
        >
            <path d={ok ? "M20 6 9 17l-5-5" : "M18 6 6 18M6 6l12 12"} />
        </svg>
    );
}

const tone = (ok: boolean | null) =>
    ok === null ? "" : ok ? "gc-ok" : "gc-bad";

function Checks({ rows }: { rows: CheckRow[] }) {
    return (
        <dl className="gc-checks">
            {rows.map((r) => (
                <div key={r.label} className="gc-check">
                    <dt>{r.label}</dt>
                    <dd className={`${tone(r.ok)} ${r.mono ? "gc-mono" : ""}`}>
                        {r.value}
                        {r.toConfirm ? (
                            <>
                                {" "}
                                <ToConfirm />
                            </>
                        ) : null}
                        {r.ok === null ? null : <Mark ok={r.ok} />}
                        {r.ok === false ? (
                            <span className="gc-sr"> (wrong)</span>
                        ) : null}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * /tools/gstin-checker (design GstinChecker*.dc.html): one GSTIN, or a
 * list, checked as they type: length, state code, PAN part, the 14th
 * character and the check character. It can't look up the business, and
 * says so. The PDF (one) and the spreadsheet (a list) are behind the
 * email gate. Nothing typed leaves the browser.
 */
export default function GstinChecker() {
    const [mode, setMode] = useState<Mode>("one");
    const [one, setOne] = useState("");
    const [list, setList] = useState("");
    const [left, setLeft] = useState(false);
    const listId = useId();

    const c = checkGstin(one);
    const many = checkList(list);
    const right = many.filter((x) => x.ok).length;

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <div className="tb-seg">
                    <Chips
                        legend={WORDS.mode}
                        options={MODES}
                        value={mode}
                        onChange={setMode}
                    />
                </div>
                {mode === "one" ? (
                    <Field
                        label={WORDS.gstin}
                        hint={WORDS.hint}
                        placeholder="29AAAAA0000A1ZY"
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        className="gc-input"
                        value={one}
                        onChange={(e) => {
                            setOne(e.target.value);
                            setLeft(false);
                        }}
                        onBlur={() => setLeft(true)}
                        error={left ? (c?.error ?? null) : null}
                    />
                ) : (
                    <div className="tp-field">
                        <label htmlFor={listId} className="tp-label">
                            {WORDS.list}
                        </label>
                        <textarea
                            id={listId}
                            rows={4}
                            spellCheck={false}
                            className="tp-input gc-input gc-list"
                            value={list}
                            onChange={(e) => setList(e.target.value)}
                        />
                    </div>
                )}
            </ToolForm>
            <ToolSide>
                {mode === "one" && c ? (
                    <Result>
                        <p
                            aria-live="polite"
                            className={`gc-verdict ${tone(c.ok)}`}
                        >
                            <Mark ok={c.ok} size={28} />
                            {c.verdict}
                        </p>
                        <Checks rows={c.rows} />
                        {c.note ? <Note>{c.note}</Note> : null}
                        <Note>
                            {WORDS.notReal}{" "}
                            <a
                                href={WORDS.portalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {WORDS.portal}
                            </a>
                            .
                        </Note>
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <button
                                type="button"
                                className="tp-btn tp-btn-wide"
                                onClick={() => window.print()}
                            >
                                {WORDS.print}
                            </button>
                        </EmailGate>
                    </Result>
                ) : mode === "list" && many.length ? (
                    <Result>
                        <table className="gc-table">
                            <caption>
                                {many.length} checked: {right} right,{" "}
                                {many.length - right} to fix
                            </caption>
                            <thead>
                                <tr>
                                    <th scope="col">GSTIN</th>
                                    <th scope="col">Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {many.map((x, n) => (
                                    <tr key={`${n}-${x.gstin}`}>
                                        <td className="gc-mono">{x.gstin}</td>
                                        <td className={tone(x.ok)}>{x.line}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <EmailGate
                            label={WORDS.listGate}
                            button={WORDS.listButton}
                        >
                            <button
                                type="button"
                                className="tp-btn tp-btn-wide"
                                onClick={() =>
                                    downloadCsv(
                                        "gstin-check.csv",
                                        listCsv(many),
                                    )
                                }
                            >
                                {WORDS.csv}
                            </button>
                        </EmailGate>
                    </Result>
                ) : (
                    <ResultEmpty>
                        {mode === "one" ? WORDS.empty : WORDS.emptyList}
                    </ResultEmpty>
                )}
            </ToolSide>
        </ToolColumns>
    );
}
