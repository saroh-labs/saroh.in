"use client";

import { useState } from "react";

import { downloadCsv } from "../download";
import { EmailGate } from "../email-gate";
import { readNumber } from "../no-show-cost-calculator/logic";
import { money, toPaise } from "../numbers";
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
import type { CommissionInput, Rule } from "./logic";
import {
    commission,
    payoutCsv,
    resultRows,
    RULES,
    WORDS,
    workingNote,
} from "./logic";

interface Row {
    name: string;
    services: string;
    products: string;
}

interface State {
    rule: Rule;
    same: string;
    service: string;
    product: string;
    ends: string[];
    slabRates: string[];
    people: Row[];
}

const EMPTY_ROW: Row = { name: "", services: "", products: "" };

/**
 * Reads the form: the sums' input when everything they need is there and
 * right, and the keys of the fields that are wrong (checked when left).
 */
function check(s: State): { input: CommissionInput | null; bad: Set<string> } {
    const bad = new Set<string>();
    const gaps = { missing: false };
    const rate = (key: string, v: string) => {
        const n = v.trim() ? readNumber(v) : null;
        if (!v.trim()) gaps.missing = true;
        else if (n === null || n > 100) bad.add(key);
        return n ?? 0;
    };
    const amount = (key: string, v: string) => {
        if (!v.trim()) return 0;
        const n = readNumber(v);
        if (n === null) bad.add(key);
        return toPaise(n ?? 0);
    };
    const service = rate(
        s.rule === "same" ? "same" : "service",
        s.rule === "same" ? s.same : s.service,
    );
    const product = s.rule === "same" ? 0 : rate("product", s.product);
    const slabs = s.rule === "slabs";
    const ends = slabs
        ? s.ends.map((v, n) => {
              const paise = amount(`end${n}`, v);
              if (!v.trim()) gaps.missing = true;
              else if (
                  paise <=
                  (n ? toPaise(readNumber(s.ends[n - 1] ?? "") ?? 0) : 0)
              )
                  bad.add(`end${n}`);
              return paise;
          })
        : [];
    const slabRates = slabs
        ? s.slabRates.map((v, n) => rate(`slab${n}`, v))
        : [];
    const people = s.people
        .map((p, n) => ({
            name: p.name,
            services: amount(`p${n}s`, p.services),
            products: amount(`p${n}p`, p.products),
            any: !!(p.services.trim() || p.products.trim()),
        }))
        .filter((p) => p.any)
        .map((p) => ({
            name: p.name,
            services: p.services,
            products: p.products,
        }));
    if (gaps.missing || bad.size || !people.length) return { input: null, bad };
    return {
        input: { rule: s.rule, service, product, ends, slabRates, people },
        bad,
    };
}

/**
 * /tools/staff-commission-calculator (design StaffCommission*.dc.html): a
 * rule (one rate, slabs, or services and products apart), each person's
 * sales, and their payouts as they type. A wrong field is marked when they
 * leave it, and the last payouts stay, marked. The payout sheet (print,
 * and a spreadsheet) is behind the email gate. Names and amounts never
 * leave the browser.
 */
export default function StaffCommissionCalculator() {
    const [s, setS] = useState<State>({
        rule: "apart",
        same: "",
        service: "",
        product: "",
        ends: [""],
        slabRates: ["", ""],
        people: [EMPTY_ROW],
    });
    const [left, setLeft] = useState<Set<string>>(new Set());
    const [last, setLast] = useState<CommissionInput | null>(null);

    function update(next: State) {
        setS(next);
        const { input } = check(next);
        if (input) setLast(input);
    }

    const { input: now, bad } = check(s);
    const held = !now && bad.size && last?.rule === s.rule ? last : null;
    const input = now ?? held;
    const c = input ? commission(input) : null;
    const note = input ? workingNote(input) : null;

    const leave = (key: string) => () =>
        setLeft((was) => new Set(was).add(key));
    const err = (key: string, words: string) =>
        left.has(key) && bad.has(key) ? words : null;
    const rateField = (key: "same" | "service" | "product") => ({
        value: s[key],
        onChange: (e: { target: { value: string } }) =>
            update({ ...s, [key]: e.target.value }),
        onBlur: leave(key),
        error: err(key, WORDS.rateBad),
        inputMode: "decimal" as const,
        suffix: "%",
    });
    const setList = (key: "ends" | "slabRates", n: number, v: string) =>
        update({ ...s, [key]: s[key].map((x, i) => (i === n ? v : x)) });
    const setPerson = (n: number, key: keyof Row, v: string) =>
        update({
            ...s,
            people: s.people.map((p, i) => (i === n ? { ...p, [key]: v } : p)),
        });
    const end = (n: number) => readNumber(s.ends[n] ?? "");

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Chips
                    legend={WORDS.rule}
                    options={RULES}
                    value={s.rule}
                    onChange={(rule) => update({ ...s, rule })}
                />
                {s.rule === "same" ? (
                    <Field
                        label={WORDS.same}
                        placeholder="10"
                        {...rateField("same")}
                    />
                ) : null}
                {s.rule === "apart" ? (
                    <div className="sc-pair">
                        <Field
                            label={WORDS.service}
                            placeholder="10"
                            {...rateField("service")}
                        />
                        <Field
                            label={WORDS.product}
                            placeholder="5"
                            {...rateField("product")}
                        />
                    </div>
                ) : null}
                {s.rule === "slabs" ? (
                    <fieldset className="tp-chips sc-slabs">
                        <legend className="tp-label">
                            {WORDS.slabsLegend}
                        </legend>
                        {s.slabRates.map((r, n) => {
                            const top = n === s.slabRates.length - 1;
                            const from = n ? end(n - 1) : null;
                            const rateField = (label: string) => (
                                <Field
                                    label={label}
                                    inputMode="decimal"
                                    placeholder={top ? "12" : "8"}
                                    suffix="%"
                                    value={r}
                                    onChange={(e) =>
                                        setList("slabRates", n, e.target.value)
                                    }
                                    onBlur={leave(`slab${n}`)}
                                    error={err(`slab${n}`, WORDS.rateBad)}
                                />
                            );
                            return top ? (
                                <div key={n}>
                                    {rateField(
                                        from === null
                                            ? "Above the last slab"
                                            : `Above ${money(toPaise(from))}`,
                                    )}
                                </div>
                            ) : (
                                <div key={n} className="sc-pair">
                                    <Field
                                        label={`Slab ${n + 1} up to`}
                                        inputMode="decimal"
                                        placeholder="50000"
                                        prefix="₹"
                                        value={s.ends[n] ?? ""}
                                        onChange={(e) =>
                                            setList("ends", n, e.target.value)
                                        }
                                        onBlur={leave(`end${n}`)}
                                        error={err(`end${n}`, WORDS.endBad)}
                                    />
                                    {rateField(`Slab ${n + 1} rate`)}
                                </div>
                            );
                        })}
                        <span className="tp-hint">{WORDS.slabsHint}</span>
                        <button
                            type="button"
                            className="tb-btn2 sc-start"
                            onClick={() =>
                                update({
                                    ...s,
                                    ends: [...s.ends, ""],
                                    slabRates: [
                                        ...s.slabRates.slice(0, -1),
                                        "",
                                        s.slabRates.at(-1) ?? "",
                                    ],
                                })
                            }
                        >
                            {WORDS.addSlab}
                        </button>
                        <Field
                            label={WORDS.product}
                            placeholder="5"
                            {...rateField("product")}
                        />
                    </fieldset>
                ) : null}
                <fieldset className="tp-chips sc-people">
                    <legend className="tp-label">{WORDS.sales}</legend>
                    <table className="sc-table">
                        <thead>
                            <tr>
                                <th scope="col">{WORDS.person}</th>
                                <th scope="col">{WORDS.services}</th>
                                <th scope="col">{WORDS.products}</th>
                                <th scope="col">
                                    <span className="sc-sr">
                                        {WORDS.remove}
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {s.people.map((p, n) => {
                                const who = p.name.trim() || "Person";
                                return (
                                    <tr key={n}>
                                        <td>
                                            <input
                                                aria-label={`Person ${n + 1} name`}
                                                className="sc-cell"
                                                value={p.name}
                                                onChange={(e) =>
                                                    setPerson(
                                                        n,
                                                        "name",
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </td>
                                        {(
                                            ["services", "products"] as const
                                        ).map((k) => (
                                            <td key={k}>
                                                <input
                                                    aria-label={`${who}, ${k}`}
                                                    inputMode="decimal"
                                                    className="sc-cell"
                                                    aria-invalid={
                                                        left.has(
                                                            `p${n}${k[0]}`,
                                                        ) &&
                                                        bad.has(`p${n}${k[0]}`)
                                                            ? true
                                                            : undefined
                                                    }
                                                    value={p[k]}
                                                    onChange={(e) =>
                                                        setPerson(
                                                            n,
                                                            k,
                                                            e.target.value,
                                                        )
                                                    }
                                                    onBlur={leave(
                                                        `p${n}${k[0]}`,
                                                    )}
                                                />
                                            </td>
                                        ))}
                                        <td className="sc-x">
                                            <button
                                                type="button"
                                                aria-label={`Remove ${p.name.trim() || "this person"}`}
                                                className="sc-remove"
                                                onClick={() =>
                                                    update({
                                                        ...s,
                                                        people:
                                                            s.people.length > 1
                                                                ? s.people.filter(
                                                                      (_, i) =>
                                                                          i !==
                                                                          n,
                                                                  )
                                                                : [EMPTY_ROW],
                                                    })
                                                }
                                            >
                                                <svg
                                                    aria-hidden="true"
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <path d="M6 6l12 12M18 6 6 18" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {[...bad].some((k) => /^p\d/.test(k) && left.has(k)) ? (
                        <span role="alert" className="tp-error">
                            {WORDS.amountBad}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        className="tb-btn2 sc-start sc-add"
                        onClick={() =>
                            update({ ...s, people: [...s.people, EMPTY_ROW] })
                        }
                    >
                        <svg
                            aria-hidden="true"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        {WORDS.addPerson}
                    </button>
                    <span className="tp-hint">{WORDS.salesHint}</span>
                </fieldset>
            </ToolForm>
            <ToolSide>
                {input && c ? (
                    <Result
                        label={WORDS.label}
                        figureLabel={WORDS.figure}
                        figure={money(c.total)}
                        rows={resultRows(input, c)}
                    >
                        {held || note ? (
                            <Note>
                                {held
                                    ? s.rule === "slabs"
                                        ? WORDS.heldSlabs
                                        : WORDS.held
                                    : note}
                            </Note>
                        ) : null}
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <button
                                type="button"
                                className="tp-btn tp-btn-wide"
                                onClick={() => window.print()}
                            >
                                {WORDS.print}
                            </button>
                            <button
                                type="button"
                                className="tb-btn2"
                                onClick={() =>
                                    downloadCsv(
                                        "commission-payouts.csv",
                                        payoutCsv(input, c),
                                    )
                                }
                            >
                                {WORDS.csv}
                            </button>
                        </EmailGate>
                    </Result>
                ) : (
                    <ResultEmpty label={WORDS.label}>{WORDS.empty}</ResultEmpty>
                )}
            </ToolSide>
        </ToolColumns>
    );
}
