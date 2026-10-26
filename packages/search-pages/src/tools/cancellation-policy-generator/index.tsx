"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { Chips, Field, ToolColumns, ToolForm, ToolSide } from "../parts";
import { updatedLine } from "../refund-policy-generator/logic";
import {
    Bubble,
    Hint,
    Marked,
    NotLegal,
    PolicyDoc,
    PrintButton,
    Small,
    useCopy,
} from "../td-parts";
import type { CancelAnswers } from "./logic";
import {
    AFTERS,
    clashes,
    DEPOSITS,
    FORMATS,
    LATES,
    MOVES,
    NOTICES,
    policy,
    policyText,
    policyTitle,
    whatsappVersion,
    WORDS,
} from "./logic";

type Notice = CancelAnswers["notice"];
type Format = (typeof FORMATS)[number]["value"];

/**
 * /tools/cancellation-policy-generator (design CancellationPolicy*.dc.html):
 * written as they answer, for the website and as one WhatsApp message.
 * Reading both is free; copying or printing asks for the email (DEC-194).
 * Not legal advice, said beside the text. Nothing typed leaves the browser.
 */
export default function CancellationPolicyGenerator() {
    const [notice, setNotice] = useState<Notice | "">("");
    const [a, setA] = useState<Omit<CancelAnswers, "notice">>({
        name: "",
        deposit: "25",
        late: "kept",
        grace: "",
        after: "shorter",
        move: "free",
        how: "",
    });
    const [format, setFormat] = useState<Format>("web");
    const set = (patch: Partial<typeof a>) => setA({ ...a, ...patch });

    const answers: CancelAnswers | null = notice ? { ...a, notice } : null;
    const updated = updatedLine(new Date());
    const wa = answers ? whatsappVersion(answers) : "";
    const web = useCopy(answers ? policyText(answers, updated) : "");
    const short = useCopy(wa);
    const clash = clashes({ ...a, notice: "24" });

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.name}
                    placeholder="Rye Studio"
                    value={a.name}
                    onChange={(e) => set({ name: e.target.value })}
                />
                <Chips<Notice | "">
                    legend={WORDS.notice}
                    options={NOTICES}
                    value={notice}
                    onChange={setNotice}
                    hint={WORDS.noticeHint}
                />
                <Chips
                    legend={WORDS.deposit}
                    options={DEPOSITS}
                    value={a.deposit}
                    onChange={(deposit) => set({ deposit })}
                    hint={WORDS.depositHint}
                />
                <div className="td-stack">
                    <Chips
                        legend={WORDS.late}
                        options={LATES}
                        value={a.late}
                        onChange={(late) => set({ late })}
                    />
                    {clash ? (
                        <span role="alert" className="tp-error">
                            {WORDS.clash}
                        </span>
                    ) : null}
                </div>
                <div className="td-pair">
                    <Field
                        label={WORDS.grace}
                        inputMode="numeric"
                        placeholder="15"
                        suffix="min"
                        value={a.grace}
                        onChange={(e) => set({ grace: e.target.value })}
                    />
                </div>
                <Chips
                    legend={WORDS.after}
                    options={AFTERS}
                    value={a.after}
                    onChange={(after) => set({ after })}
                />
                <Chips
                    legend={WORDS.move}
                    options={MOVES}
                    value={a.move}
                    onChange={(move) => set({ move })}
                />
                <Field
                    label={WORDS.how}
                    placeholder="Reply on WhatsApp to +91 99999 99999"
                    hint={WORDS.howHint}
                    value={a.how}
                    onChange={(e) => set({ how: e.target.value })}
                />
            </ToolForm>
            <ToolSide>
                {answers ? (
                    <>
                        <Chips
                            legend={WORDS.show}
                            options={FORMATS}
                            value={format}
                            onChange={setFormat}
                        />
                        {format === "web" ? (
                            <PolicyDoc
                                title={policyTitle(answers)}
                                sub={updated}
                                paras={policy(answers)}
                            />
                        ) : (
                            <section
                                aria-label={WORDS.waLabel}
                                className="cp-wa"
                            >
                                <Bubble green>
                                    <Marked text={wa} />
                                </Bubble>
                                <Small>{WORDS.chars(wa.length)}</Small>
                            </section>
                        )}
                        {answers.deposit === "none" &&
                        answers.late === "due" ? (
                            <Hint>{WORDS.dueNoDeposit}</Hint>
                        ) : null}
                        <NotLegal />
                        <div className="td-card td-light">
                            <EmailGate
                                label={WORDS.gate}
                                button={WORDS.gateButton}
                            >
                                <div className="td-btns">
                                    <button
                                        type="button"
                                        className={
                                            web.copied
                                                ? "td-btn td-btn-done"
                                                : "td-btn td-btn-light"
                                        }
                                        onClick={web.copy}
                                    >
                                        {web.copied
                                            ? WORDS.copied
                                            : WORDS.copyWeb}
                                    </button>
                                    <button
                                        type="button"
                                        className={
                                            short.copied
                                                ? "td-btn td-btn-done"
                                                : "td-btn td-btn-light"
                                        }
                                        onClick={short.copy}
                                    >
                                        {short.copied
                                            ? WORDS.copied
                                            : WORDS.copyWa}
                                    </button>
                                </div>
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
