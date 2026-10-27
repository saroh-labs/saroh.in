"use client";

import { EmailGate } from "../email-gate";

import { useState } from "react";

import { Chips, Field, ToolColumns, ToolForm, ToolSide } from "../parts";
import {
    Bubble,
    Card,
    Eyebrow,
    Opt,
    Small,
    Textarea,
    useCopy,
} from "../td-parts";
import type { Start } from "./logic";
import { readMobile, showMobile, STARTS, waLink, WORDS } from "./logic";

/**
 * /tools/whatsapp-link-generator (design WhatsappLink*.dc.html): the link
 * is drawn as they type. A number is checked when they leave it; while
 * it's wrong the last good link stays, marked. It makes a link, not a
 * file, so there's no email step. Nothing typed leaves the browser.
 */
export default function WhatsappLinkGenerator() {
    const [number, setNumber] = useState("");
    const [message, setMessage] = useState("");
    const [start, setStart] = useState<Start | "">("");
    const [left, setLeft] = useState(false);
    const [last, setLast] = useState<string | null>(null);

    const read = readMobile(number);
    const digits = read.at === "ok" ? read.digits : last;
    const link = digits ? waLink(digits, message) : null;
    const { copied, copy } = useCopy(link ?? "");
    const text = message.trim();

    function changeNumber(value: string) {
        setNumber(value);
        const r = readMobile(value);
        if (r.at === "ok") setLast(r.digits);
    }

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.number}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="99999 99999"
                    prefix="+91"
                    className="wl-num"
                    value={number}
                    onChange={(e) => changeNumber(e.target.value)}
                    onBlur={() => setLeft(true)}
                    error={left && read.at === "bad" ? read.problem : null}
                />
                <Textarea
                    label={
                        <>
                            {WORDS.message}
                            <Opt />
                        </>
                    }
                    rows={3}
                    placeholder={STARTS[0].message}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                />
                <Chips<Start | "">
                    legend={WORDS.start}
                    options={STARTS}
                    value={start}
                    onChange={(v) => {
                        setStart(v);
                        setMessage(
                            STARTS.find((s) => s.value === v)?.message ?? "",
                        );
                    }}
                />
            </ToolForm>
            <ToolSide>
                <Card label={WORDS.link}>
                    <Eyebrow>{WORDS.link}</Eyebrow>
                    {link && digits ? (
                        <>
                            <div className="wl-link">{link}</div>
                            <EmailGate
                                label={WORDS.gate}
                                button={WORDS.gateButton}
                            >
                                <div className="td-btns">
                                    <button
                                        type="button"
                                        className={
                                            copied
                                                ? "td-btn td-btn-done"
                                                : "tp-btn td-btn"
                                        }
                                        onClick={copy}
                                    >
                                        {copied ? WORDS.copied : WORDS.copy}
                                    </button>
                                    <a
                                        className="td-btn td-btn-light"
                                        href={link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {WORDS.test}
                                    </a>
                                </div>
                            </EmailGate>
                            {copied ? (
                                <Small status>{WORDS.copiedLine}</Small>
                            ) : read.at === "bad" ? (
                                <Small status>
                                    {WORDS.held(showMobile(digits))}
                                </Small>
                            ) : !text ? (
                                <Small>{WORDS.noMessage}</Small>
                            ) : null}
                        </>
                    ) : (
                        <p className="wl-empty">{WORDS.empty}</p>
                    )}
                </Card>
                {link && text ? (
                    <Card>
                        <span className="wl-sees">{WORDS.sees}</span>
                        <Bubble>{text}</Bubble>
                        <Small>{WORDS.seesLine}</Small>
                    </Card>
                ) : null}
            </ToolSide>
        </ToolColumns>
    );
}
