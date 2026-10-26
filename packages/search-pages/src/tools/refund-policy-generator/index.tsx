"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { Chips, Field, ToolColumns, ToolForm, ToolSide } from "../parts";
import {
    Check,
    NotLegal,
    Opt,
    PolicyDoc,
    PrintButton,
    Small,
    Textarea,
    useCopy,
} from "../td-parts";
import { readMobile } from "../whatsapp-link-generator/logic";
import type { RefundAnswers } from "./logic";
import {
    BACKS,
    DAYS,
    policy,
    policyText,
    policyTitle,
    SELLS,
    SHIPS,
    UNHAPPY,
    updatedLine,
    WITHINS,
    WORDS,
} from "./logic";

type Sell = RefundAnswers["sell"];

/**
 * /tools/refund-policy-generator (design RefundPolicy*.dc.html): the
 * policy is written as they answer, with no button. Reading it is free;
 * copying it or printing it asks for the email (DEC-194). Not legal
 * advice, said beside the text. Nothing typed leaves the browser.
 */
export default function RefundPolicyGenerator() {
    const [sell, setSell] = useState<Sell | "">("");
    const [a, setA] = useState<Omit<RefundAnswers, "sell" | "wa">>({
        name: "",
        days: "7",
        unused: true,
        back: "refund",
        within: "7",
        ship: "customer",
        unhappy: "redo",
        not: "",
        email: "",
    });
    const [wa, setWa] = useState("");
    const [left, setLeft] = useState(false);
    const set = (patch: Partial<typeof a>) => setA({ ...a, ...patch });

    const waRead = readMobile(wa);
    const answers: RefundAnswers | null = sell
        ? { ...a, sell, wa: waRead.at === "ok" ? waRead.digits : "" }
        : null;
    const updated = updatedLine(new Date());
    const { copied, copy } = useCopy(
        answers ? policyText(answers, updated) : "",
    );

    const products = sell === "products" || sell === "both";
    const returns = products && a.days !== "0";
    const waError = !left
        ? null
        : waRead.at === "bad"
          ? waRead.problem
          : waRead.at === "empty" && !a.email.trim()
            ? WORDS.noContact
            : null;

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.name}
                    placeholder="Gulmohar Handlooms"
                    value={a.name}
                    onChange={(e) => set({ name: e.target.value })}
                />
                <Chips<Sell | "">
                    legend={WORDS.sell}
                    options={SELLS}
                    value={sell}
                    onChange={setSell}
                />
                {products ? (
                    <>
                        <Chips
                            legend={WORDS.days}
                            options={DAYS}
                            value={a.days}
                            onChange={(days) => set({ days })}
                            hint={WORDS.daysHint}
                        />
                        {returns ? (
                            <>
                                <Check
                                    label={WORDS.unused}
                                    checked={a.unused}
                                    onChange={(unused) => set({ unused })}
                                />
                                <Chips
                                    legend={WORDS.back}
                                    options={BACKS}
                                    value={a.back}
                                    onChange={(back) => set({ back })}
                                />
                            </>
                        ) : null}
                    </>
                ) : null}
                {sell === "services" || sell === "both" ? (
                    <Chips
                        legend={WORDS.unhappy}
                        options={UNHAPPY}
                        value={a.unhappy}
                        onChange={(unhappy) => set({ unhappy })}
                    />
                ) : null}
                {(returns && a.back !== "exchange") ||
                (sell !== "products" && sell && a.unhappy === "refund") ? (
                    <Chips
                        legend={WORDS.within}
                        options={WITHINS}
                        value={a.within}
                        onChange={(within) => set({ within })}
                    />
                ) : null}
                {returns ? (
                    <>
                        <Chips
                            legend={WORDS.ship}
                            options={SHIPS}
                            value={a.ship}
                            onChange={(ship) => set({ ship })}
                            hint={WORDS.shipHint}
                        />
                        <Textarea
                            label={
                                <>
                                    {WORDS.not}
                                    <Opt />
                                </>
                            }
                            rows={2}
                            placeholder="Sale items, altered blouses, innerwear"
                            value={a.not}
                            onChange={(e) => set({ not: e.target.value })}
                        />
                    </>
                ) : null}
                <div className="td-pair">
                    <Field
                        label={WORDS.wa}
                        type="tel"
                        inputMode="numeric"
                        placeholder="99999 99999"
                        prefix="+91"
                        className="wl-num"
                        value={wa}
                        onChange={(e) => setWa(e.target.value)}
                        onBlur={() => setLeft(true)}
                        error={waError}
                    />
                    <Field
                        label={
                            <>
                                {WORDS.email}
                                <Opt />
                            </>
                        }
                        type="email"
                        placeholder="returns@example.com"
                        value={a.email}
                        onChange={(e) => set({ email: e.target.value })}
                    />
                </div>
            </ToolForm>
            <ToolSide>
                {answers ? (
                    <>
                        <PolicyDoc
                            title={policyTitle(answers)}
                            sub={updated}
                            paras={policy(answers)}
                        />
                        <NotLegal />
                        <div className="td-card td-light">
                            <EmailGate
                                label={WORDS.gate}
                                button={WORDS.gateButton}
                            >
                                <button
                                    type="button"
                                    className={
                                        copied
                                            ? "td-btn td-btn-done"
                                            : "td-btn td-btn-light"
                                    }
                                    onClick={copy}
                                >
                                    {copied ? WORDS.copied : WORDS.copy}
                                </button>
                                <PrintButton>{WORDS.print}</PrintButton>
                            </EmailGate>
                            <Small>{WORDS.gateAfter}</Small>
                        </div>
                    </>
                ) : (
                    <p aria-live="polite" className="td-empty">
                        {WORDS.empty}
                    </p>
                )}
            </ToolSide>
        </ToolColumns>
    );
}
