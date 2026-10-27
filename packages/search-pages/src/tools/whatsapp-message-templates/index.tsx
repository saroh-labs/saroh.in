"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { Chips, Field, ToolColumns, ToolForm, ToolSide } from "../parts";
import {
    Bubble,
    Card,
    Eyebrow,
    Hint,
    Marked,
    Opt,
    PrintButton,
    Small,
    useCopy,
} from "../td-parts";
import {
    readMobile,
    showMobile,
    waLink,
} from "../whatsapp-link-generator/logic";
import type { Details, Key, Template } from "./logic";
import {
    allMessages,
    FIELDS,
    gapNote,
    message,
    TEMPLATES,
    WORDS,
} from "./logic";

/**
 * /tools/whatsapp-message-templates (design WhatsappTemplates*.dc.html):
 * pick a message, fill in the details once, copy it or open the chat with
 * it typed in. The owner sends it from their own WhatsApp; nothing is
 * sent from here. One message is free to copy; the full set, filled in,
 * is behind the email gate (DEC-194). Nothing typed leaves the browser.
 */
export default function WhatsappMessageTemplates() {
    const [tpl, setTpl] = useState<Template>("booking");
    const [d, setD] = useState<Details>({});
    const [number, setNumber] = useState("");
    const [left, setLeft] = useState(false);

    const text = message(tpl, d);
    const all = allMessages(d);
    const one = useCopy(text);
    const every = useCopy(all.map((m) => `${m.label}\n${m.text}`).join("\n\n"));
    const read = readMobile(number);
    const digits = read.at === "ok" ? read.digits : null;
    const note = gapNote(tpl, d);
    const fields = TEMPLATES.find((t) => t.value === tpl)?.fields ?? [];

    const field = (
        k: Key,
        extra: Partial<Parameters<typeof Field>[0]> = {},
    ) => (
        <Field
            key={k}
            label={FIELDS[k].label}
            placeholder={FIELDS[k].eg}
            value={d[k] ?? ""}
            onChange={(e) => setD({ ...d, [k]: e.target.value })}
            {...extra}
        />
    );
    const rest = fields.filter((k) => k !== "biz" && k !== "name");

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Chips
                    legend={WORDS.pick}
                    options={TEMPLATES}
                    value={tpl}
                    onChange={setTpl}
                />
                <div className="td-pair">
                    {field("biz")}
                    {field("name")}
                </div>
                {tpl === "payment" ? (
                    <>
                        <div className="td-pair">
                            {field("amount", {
                                prefix: "₹",
                                inputMode: "decimal",
                            })}
                            {field("visit")}
                        </div>
                        {field("upi", { className: "td-mono" })}
                    </>
                ) : (
                    rest.map((k) => field(k))
                )}
                <Field
                    label={
                        <>
                            {WORDS.number}
                            <Opt />
                        </>
                    }
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="99999 99999"
                    prefix="+91"
                    className="wl-num"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    onBlur={() => setLeft(true)}
                    hint={WORDS.numberHint}
                    error={left && read.at === "bad" ? read.problem : null}
                />
            </ToolForm>
            <ToolSide>
                <Card label={WORDS.yours}>
                    <Eyebrow>{WORDS.yours}</Eyebrow>
                    <div className="wt-chat">
                        <Bubble>
                            <Marked text={text} />
                        </Bubble>
                    </div>
                    <div className="td-btns">
                        <button
                            type="button"
                            className={
                                one.copied
                                    ? "td-btn td-btn-done"
                                    : "tp-btn td-btn"
                            }
                            onClick={one.copy}
                        >
                            {one.copied ? WORDS.copied : WORDS.copy}
                        </button>
                        <a
                            className="td-btn td-btn-light"
                            href={waLink(digits, text)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg
                                aria-hidden="true"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z" />
                            </svg>
                            {WORDS.open}
                        </a>
                    </div>
                    {one.copied ? (
                        <Small status>{WORDS.copiedLine}</Small>
                    ) : (
                        <Small>
                            {digits
                                ? WORDS.openTo(showMobile(digits))
                                : WORDS.openPick}
                        </Small>
                    )}
                    {note ? <Hint>{note}</Hint> : null}
                </Card>
                <Card>
                    <EmailGate
                        label={WORDS.gate}
                        button={WORDS.gateButton}
                        sentLine={WORDS.sentLine}
                    >
                        <ol className="wt-all">
                            {all.map((m) => (
                                <li key={m.label}>
                                    <b>{m.label}</b>
                                    <span>
                                        <Marked text={m.text} />
                                    </span>
                                </li>
                            ))}
                        </ol>
                        <div className="td-btns">
                            <button
                                type="button"
                                className={
                                    every.copied
                                        ? "td-btn td-btn-done"
                                        : "td-btn td-btn-light"
                                }
                                onClick={every.copy}
                            >
                                {every.copied ? WORDS.copiedAll : WORDS.copyAll}
                            </button>
                        </div>
                        <PrintButton>{WORDS.print}</PrintButton>
                    </EmailGate>
                </Card>
            </ToolSide>
        </ToolColumns>
    );
}
