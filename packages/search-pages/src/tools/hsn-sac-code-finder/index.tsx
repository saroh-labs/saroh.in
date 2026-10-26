"use client";

import { useId, useState } from "react";

import { downloadCsv } from "../download";
import { EmailGate } from "../email-gate";
import { Chips, ToolColumns, ToolForm, ToolSide } from "../parts";
import { ToConfirm } from "../to-confirm";
import type { Code } from "./codes";
import type { Filter } from "./logic";
import { countText, FILTERS, listCsv, POPULAR, search, WORDS } from "./logic";

function Popular({ pick }: { pick: (q: string) => void }) {
    return (
        <div className="hs-popular">
            <span className="tp-hint">{WORDS.popular}</span>
            <div className="tp-chip-row">
                {POPULAR.map((p) => (
                    <button
                        key={p}
                        type="button"
                        className="hs-pill"
                        onClick={() => pick(p)}
                    >
                        {p}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * /tools/hsn-sac-code-finder (design HsnSacFinder*.dc.html): search what
 * you sell in plain words, or a code, over a list that ships with the
 * page; add codes to My list. Every rate is marked to confirm with a CA.
 * The list as a spreadsheet is behind the email gate. Searches never
 * leave the browser.
 */
export default function HsnSacFinder() {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [mine, setMine] = useState<Code[]>([]);
    const id = useId();

    const found = search(query, filter);
    const notes = [...new Set(found.flatMap((c) => (c.note ? [c.note] : [])))];
    const has = (c: Code) => mine.some((m) => m.code === c.code);

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <div role="search" className="tp-field">
                    <label htmlFor={id} className="tp-label">
                        {WORDS.search}
                    </label>
                    <div className="tp-affix">
                        <svg
                            aria-hidden="true"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="hs-icon"
                        >
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-3.5-3.5" />
                        </svg>
                        <input
                            id={id}
                            type="search"
                            autoComplete="off"
                            placeholder={WORDS.placeholder}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="tp-input hs-q"
                        />
                    </div>
                </div>
                <div className="tb-seg">
                    <Chips
                        legend={WORDS.show}
                        options={FILTERS}
                        value={filter}
                        onChange={setFilter}
                    />
                </div>
                {!query.trim() ? (
                    <Popular pick={setQuery} />
                ) : found.length ? (
                    <div className="hs-results">
                        <span aria-live="polite" className="tp-hint">
                            {countText(found.length, query)}
                        </span>
                        <ul className="hs-list">
                            {found.map((c) => (
                                <li key={c.code} className="hs-row">
                                    <div className="hs-what">
                                        <div className="hs-head">
                                            <span className="hs-kind">
                                                {c.kind}
                                            </span>
                                            <span className="hs-code">
                                                {c.code}
                                            </span>
                                            <span className="hs-rate">
                                                GST {c.rate}
                                            </span>
                                            <ToConfirm />
                                        </div>
                                        <span className="hs-desc">
                                            {c.desc}
                                        </span>
                                    </div>
                                    {has(c) ? (
                                        <button
                                            type="button"
                                            className="tb-btn2 hs-in"
                                            onClick={() =>
                                                setMine((was) =>
                                                    was.filter(
                                                        (m) =>
                                                            m.code !== c.code,
                                                    ),
                                                )
                                            }
                                        >
                                            {WORDS.added}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            aria-label={`Add ${c.kind} ${c.code} to my list`}
                                            className="tb-btn2"
                                            onClick={() =>
                                                setMine((was) => [...was, c])
                                            }
                                        >
                                            {WORDS.add}
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                        {notes.map((n) => (
                            <p key={n} className="hs-note">
                                {n} <ToConfirm />
                            </p>
                        ))}
                    </div>
                ) : (
                    <>
                        <div role="status" className="hs-none">
                            <span className="hs-none-h">
                                {WORDS.none(query)}
                            </span>
                            <span>{WORDS.noneTry}</span>
                        </div>
                        <Popular pick={setQuery} />
                    </>
                )}
                <p className="hs-note">
                    {WORDS.rateNote} <ToConfirm /> {WORDS.ca}
                </p>
            </ToolForm>
            <ToolSide>
                <section aria-label={WORDS.list} className="hs-mine">
                    <div className="hs-mine-head">
                        <h2 className="hs-mine-h">{WORDS.list}</h2>
                        {mine.length ? (
                            <span className="tp-hint">
                                {mine.length}{" "}
                                {mine.length === 1 ? "code" : "codes"}
                            </span>
                        ) : null}
                    </div>
                    {mine.length ? (
                        <>
                            <ul className="hs-list">
                                {mine.map((c) => (
                                    <li key={c.code} className="hs-mine-row">
                                        <span>
                                            <span className="hs-code-s">
                                                {c.code}
                                            </span>{" "}
                                            · {c.name}
                                        </span>
                                        <span className="hs-mine-rate">
                                            {c.rate}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <span className="tp-hint">{WORDS.listHint}</span>
                            <EmailGate
                                label={WORDS.gate}
                                button={WORDS.gateButton}
                            >
                                <button
                                    type="button"
                                    className="tp-btn tp-btn-wide"
                                    onClick={() =>
                                        downloadCsv(
                                            "hsn-sac-codes.csv",
                                            listCsv(mine),
                                        )
                                    }
                                >
                                    {WORDS.csv}
                                </button>
                            </EmailGate>
                        </>
                    ) : (
                        <p className="tp-hint">{WORDS.listEmpty}</p>
                    )}
                </section>
            </ToolSide>
        </ToolColumns>
    );
}
