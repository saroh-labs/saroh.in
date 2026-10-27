"use client";

import type { CSSProperties } from "react";
import { useState } from "react";

import { EmailGate } from "../email-gate";
import { Chips, Field, ToolColumns, ToolForm, ToolSide } from "../parts";
import { Marked, Opt, Paper, PrintButton, Small } from "../td-parts";
import type { Count, Sheet } from "./logic";
import { columns, COUNTS, offerLine, readCount, SHEETS, WORDS } from "./logic";

interface CardProps {
    biz: string;
    area: string;
    n: number;
    reward: string;
}

function Front({ biz, area, n, reward }: CardProps) {
    return (
        <div className="lc-card td-sheet">
            <div className="lc-top">
                <span className="lc-biz">
                    <Marked text={biz} />
                </span>
                {area ? <span className="lc-area">{area}</span> : null}
            </div>
            <span className="lc-offer">
                {offerLine(n)}{" "}
                <b>
                    <Marked text={reward} />
                </b>
            </span>
            <div
                className="lc-grid"
                style={{ "--lc-cols": columns(n) } as CSSProperties}
            >
                {Array.from({ length: n }, (_, i) =>
                    i === n - 1 ? (
                        <span key={i} className="lc-stamp lc-free">
                            {WORDS.free}
                        </span>
                    ) : (
                        <span key={i} className="lc-stamp">
                            {i + 1}
                        </span>
                    ),
                )}
            </div>
        </div>
    );
}

function Back({
    biz,
    rule,
    phone,
}: {
    biz: string;
    rule: string;
    phone: string;
}) {
    return (
        <div className="lc-card lc-back td-sheet">
            <span className="lc-biz">{biz}</span>
            <span className="lc-offer">
                {rule ? `One stamp for: ${rule}` : WORDS.back}
            </span>
            {phone ? <span className="lc-area">{phone}</span> : null}
        </div>
    );
}

/**
 * /tools/loyalty-card-maker (design LoyaltyCard*.dc.html): the card is
 * always drawn, with gaps marked. Making it is free; printing the sheet
 * (or saving it as a PDF) is behind the email gate. The print sheet is
 * the fronts, then the backs, with cut lines. Nothing typed leaves the
 * browser.
 */
export default function LoyaltyCardMaker() {
    const [biz, setBiz] = useState("");
    const [area, setArea] = useState("");
    const [count, setCount] = useState<Count>("10");
    const [other, setOther] = useState("");
    const [lastN, setLastN] = useState(10);
    const [reward, setReward] = useState("");
    const [rule, setRule] = useState("");
    const [phone, setPhone] = useState("");
    const [sheet, setSheet] = useState<Sheet>("ten");
    const [left, setLeft] = useState<Set<string>>(new Set());
    const leave = (k: string) => () => setLeft((was) => new Set(was).add(k));

    const read = count === "other" ? readCount(other) : null;
    const n = read ? (read.ok ? read.n : lastN) : Number(count);
    const ready = biz.trim() !== "" && reward.trim() !== "";
    const card: CardProps = {
        biz: biz.trim() || "[Business name]",
        area: area.trim(),
        n,
        reward: reward.trim() || "[reward]",
    };
    const copies = sheet === "ten" ? 10 : 1;

    return (
        <ToolColumns>
            <style>
                {"@media print { @page { size: A4; margin: 10mm; } }"}
            </style>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.biz}
                    placeholder="Your business name"
                    value={biz}
                    onChange={(e) => setBiz(e.target.value)}
                />
                <Field
                    label={
                        <>
                            {WORDS.area}
                            <Opt />
                        </>
                    }
                    placeholder="Indiranagar"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                />
                <Chips
                    legend={WORDS.count}
                    options={COUNTS}
                    value={count}
                    onChange={(c) => {
                        setCount(c);
                        if (c !== "other") setLastN(Number(c));
                    }}
                    hint={WORDS.countHint}
                />
                {count === "other" ? (
                    <Field
                        label={WORDS.other}
                        inputMode="numeric"
                        placeholder="9"
                        value={other}
                        onChange={(e) => {
                            setOther(e.target.value);
                            const r = readCount(e.target.value);
                            if (r.ok) setLastN(r.n);
                        }}
                        onBlur={leave("other")}
                        error={
                            left.has("other") && read && !read.ok
                                ? read.problem
                                : null
                        }
                    />
                ) : null}
                <Field
                    label={WORDS.reward}
                    placeholder="Free coffee"
                    hint={WORDS.rewardHint}
                    value={reward}
                    onChange={(e) => setReward(e.target.value)}
                    onBlur={leave("reward")}
                    error={
                        left.has("reward") && !reward.trim()
                            ? WORDS.noReward
                            : null
                    }
                />
                <Field
                    label={
                        <>
                            {WORDS.rule}
                            <Opt />
                        </>
                    }
                    placeholder="Every visit over ₹150"
                    hint={WORDS.ruleHint}
                    value={rule}
                    onChange={(e) => setRule(e.target.value)}
                />
                <Field
                    label={
                        <>
                            {WORDS.phone}
                            <Opt />
                        </>
                    }
                    type="tel"
                    placeholder="+91 98765 43210"
                    hint={WORDS.phoneHint}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />
                <Chips
                    legend={WORDS.sheet}
                    options={SHEETS}
                    value={sheet}
                    onChange={setSheet}
                />
            </ToolForm>
            <ToolSide>
                <Paper
                    label={WORDS.out}
                    caption={biz.trim() ? WORDS.caption : WORDS.emptyCaption}
                >
                    <div
                        role="img"
                        aria-label={`Loyalty card for ${card.biz}: ${n} stamps, the last one is ${card.reward}`}
                        className={biz.trim() ? "lc-wrap" : "lc-wrap td-faint"}
                    >
                        <Front {...card} />
                    </div>
                    <div aria-hidden="true" className="lc-print">
                        <div className="lc-fronts">
                            {Array.from({ length: copies }, (_, i) => (
                                <Front key={i} {...card} />
                            ))}
                        </div>
                        {/* Mirrored rows, so each back lands on its front when printed both sides. */}
                        <div className="lc-backs">
                            {Array.from({ length: copies }, (_, i) => (
                                <Back
                                    key={i}
                                    biz={card.biz}
                                    rule={rule.trim()}
                                    phone={phone.trim()}
                                />
                            ))}
                        </div>
                    </div>
                </Paper>
                {ready ? (
                    <div className="td-light td-gate-wrap">
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <PrintButton>{WORDS.print}</PrintButton>
                        </EmailGate>
                        <Small>{WORDS.gateAfter[sheet]}</Small>
                    </div>
                ) : null}
            </ToolSide>
        </ToolColumns>
    );
}
