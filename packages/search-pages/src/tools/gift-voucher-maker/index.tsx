"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { readNumber } from "../no-show-cost-calculator/logic";
import { Chips, Field, ToolColumns, ToolForm, ToolSide } from "../parts";
import { Marked, Opt, Paper, PrintButton, Small } from "../td-parts";
import type { Kind } from "./logic";
import {
    browserRandom,
    isoDay,
    KINDS,
    makeCode,
    readDate,
    showDate,
    WORDS,
    worth,
} from "./logic";

interface VoucherProps {
    biz: string;
    big: string;
    line: string;
    to: string;
    from: string;
    code: string;
    until: string;
    phone: string;
    terms: string;
}

function Voucher(v: VoucherProps) {
    return (
        <div className="gv-card td-sheet">
            <div className="gv-main">
                <span className="gv-eyebrow">{WORDS.eyebrow}</span>
                <span className="gv-biz">
                    <Marked text={v.biz} />
                </span>
                <span className="gv-worth">
                    <Marked text={v.big} />
                </span>
                <span className="gv-line">{v.line}</span>
                {v.to || v.from ? (
                    <span className="gv-line">
                        {v.to ? (
                            <>
                                For <b>{v.to}</b>
                            </>
                        ) : null}
                        {v.to && v.from ? ", from " : v.from ? "From " : null}
                        {v.from ? <b>{v.from}</b> : null}
                    </span>
                ) : null}
                {v.terms ? <span className="gv-terms">{v.terms}</span> : null}
            </div>
            <div className="gv-stub">
                <span className="gv-k">Code</span>
                <span className="gv-code">
                    <Marked text={v.code} />
                </span>
                <span className="gv-k">{WORDS.until}</span>
                <span className="gv-v">{v.until}</span>
                {v.phone ? (
                    <span className="gv-book">Book on {v.phone}</span>
                ) : null}
            </div>
        </div>
    );
}

/**
 * /tools/gift-voucher-maker (design GiftVoucher*.dc.html): the voucher is
 * always drawn, with gaps marked until filled. Making it is free; printing
 * it (or saving it as a PDF) is behind the email gate. A code is made in
 * the browser the first time they type the business name, or on New code;
 * nothing is checked against a list. Nothing typed leaves the browser.
 */
export default function GiftVoucherMaker() {
    const [biz, setBiz] = useState("");
    const [kind, setKind] = useState<Kind>("amount");
    const [amount, setAmount] = useState("");
    const [service, setService] = useState("");
    const [to, setTo] = useState("");
    const [from, setFrom] = useState("");
    const [code, setCode] = useState("");
    const [until, setUntil] = useState("");
    const [goodUntil, setGoodUntil] = useState("");
    const [phone, setPhone] = useState("");
    const [terms, setTerms] = useState("");
    const [left, setLeft] = useState<Set<string>>(new Set());
    const leave = (k: string) => () => setLeft((was) => new Set(was).add(k));

    const today = isoDay(new Date());
    const untilIso = readDate(until);
    const untilProblem = !until.trim()
        ? null
        : !untilIso
          ? WORDS.untilBad
          : untilIso <= today
            ? WORDS.past(showDate(today))
            : null;
    const amountBad = amount.trim() !== "" && !readNumber(amount);
    const big = worth(kind, amount, service);
    const ready = !big.startsWith("[");

    const v: VoucherProps = {
        biz: biz.trim() || "[business name]",
        big,
        line: kind === "amount" ? WORDS.amountLine : WORDS.serviceLine,
        to: to.trim(),
        from: from.trim(),
        code: code.trim() || "[code]",
        until: goodUntil ? showDate(goodUntil) : WORDS.open,
        phone: phone.trim(),
        terms: terms.trim(),
    };

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.biz}
                    placeholder="Rye Studio"
                    value={biz}
                    onChange={(e) => {
                        setBiz(e.target.value);
                        if (!code && e.target.value.trim())
                            setCode(makeCode(e.target.value, browserRandom));
                    }}
                />
                <Chips
                    legend={WORDS.kind}
                    options={KINDS}
                    value={kind}
                    onChange={setKind}
                />
                {kind === "amount" ? (
                    <Field
                        label={WORDS.amount}
                        inputMode="decimal"
                        placeholder="2,000"
                        prefix="₹"
                        hint={WORDS.amountHint}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onBlur={leave("amount")}
                        error={
                            left.has("amount") && amountBad
                                ? WORDS.amountBad
                                : null
                        }
                    />
                ) : (
                    <Field
                        label={WORDS.service}
                        placeholder="Hair spa and blow-dry"
                        value={service}
                        onChange={(e) => setService(e.target.value)}
                        onBlur={leave("service")}
                        error={
                            left.has("service") && !service.trim()
                                ? WORDS.noService
                                : null
                        }
                    />
                )}
                <div className="td-pair">
                    <Field
                        label={
                            <>
                                {WORDS.to}
                                <Opt />
                            </>
                        }
                        placeholder="Ananya"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                    />
                    <Field
                        label={
                            <>
                                {WORDS.from}
                                <Opt />
                            </>
                        }
                        placeholder="Rohan"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                    />
                </div>
                <div className="tp-field">
                    <label htmlFor="gv-code" className="tp-label">
                        {WORDS.code}
                    </label>
                    <div className="gv-code-row">
                        <input
                            id="gv-code"
                            aria-describedby="gv-code-hint"
                            placeholder="RYE-7K2Q-9M"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className="tp-input td-mono"
                        />
                        <button
                            type="button"
                            className="td-btn td-btn-light"
                            onClick={() =>
                                setCode(makeCode(biz, browserRandom))
                            }
                        >
                            {WORDS.newCode}
                        </button>
                    </div>
                    <span id="gv-code-hint" className="tp-hint">
                        {WORDS.codeHint}
                    </span>
                </div>
                <Field
                    label={WORDS.until}
                    placeholder="30 Apr 2027"
                    hint={WORDS.untilHint}
                    value={until}
                    onChange={(e) => {
                        setUntil(e.target.value);
                        const iso = readDate(e.target.value);
                        if (!e.target.value.trim()) setGoodUntil("");
                        else if (iso && iso > today) setGoodUntil(iso);
                    }}
                    onBlur={leave("until")}
                    error={left.has("until") ? untilProblem : null}
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
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />
                <Field
                    label={
                        <>
                            {WORDS.terms}
                            <Opt />
                        </>
                    }
                    placeholder="One visit. Not exchangeable for cash."
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                />
            </ToolForm>
            <ToolSide>
                <Paper
                    label={WORDS.out}
                    caption={ready ? WORDS.caption : WORDS.emptyCaption}
                >
                    <div
                        role="img"
                        aria-label={`Gift voucher from ${v.biz} worth ${v.big}`}
                        className={ready ? "gv-wrap" : "gv-wrap td-faint"}
                    >
                        <Voucher {...v} />
                    </div>
                    <div aria-hidden="true" className="gv-print">
                        <Voucher {...v} />
                        <Voucher {...v} />
                    </div>
                </Paper>
                {ready ? (
                    <div className="td-light td-gate-wrap">
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <PrintButton>{WORDS.print}</PrintButton>
                        </EmailGate>
                        <Small>{WORDS.gateAfter}</Small>
                    </div>
                ) : null}
            </ToolSide>
        </ToolColumns>
    );
}
