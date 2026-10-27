"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { Chips, Field, ToolColumns, ToolForm } from "../parts";
import {
    DownloadButton,
    downloadQrPng,
    Downloads,
    PNG_FAILED,
    QrCard,
    QrCode,
    QrSample,
    useLastGood,
} from "../qr";
import type { Size } from "./logic";
import {
    NAME_MAX,
    NAME_ONE_LINE,
    reviewLinkProblem,
    SIZES,
    WORDS,
} from "./logic";

const STAR = (
    <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="#F0A92B"
        stroke="#9A5B07"
        strokeWidth="1.2"
    >
        <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" />
    </svg>
);

/**
 * /tools/review-qr-code-generator (design ReviewQr*.dc.html): paste the
 * Google review link, get a code on a card that asks for a review. The link
 * is checked when they leave the field (its shape only: Saroh can't open
 * the profile); while it's wrong the last good card stays. The card is free
 * to see; the PNG and printing are behind the email gate.
 */
export default function ReviewQrCodeGenerator() {
    const [name, setName] = useState("");
    const [link, setLink] = useState("");
    const [head, setHead] = useState<string>(WORDS.headStart);
    const [size, setSize] = useState<Size>("counter");
    const [leftLink, setLeftLink] = useState(false);
    const [saved, setSaved] = useState<"png" | "print" | null>(null);
    const [pngError, setPngError] = useState(false);

    const problem = link.trim() ? reviewLinkProblem(link) : null;
    const code = useLastGood(
        link.trim() && !problem ? link.trim() : null,
        problem !== null,
    );
    const shown = name.trim() || "Your business";

    async function png(text: string) {
        const ok = await downloadQrPng(text, "google-review-qr-code");
        setPngError(!ok);
        if (ok) setSaved("png");
    }

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.name}
                    placeholder="As customers know you"
                    maxLength={NAME_MAX}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    hint={
                        name.trim().length > NAME_ONE_LINE ? (
                            <span className="qc-warn">
                                {WORDS.nameLong(name.trim().length)}
                            </span>
                        ) : (
                            WORDS.nameHint
                        )
                    }
                />
                <Field
                    label={WORDS.link}
                    hint={WORDS.linkHint}
                    placeholder="https://g.page/r/…/review"
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="qc-input-mono"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    onBlur={() => setLeftLink(true)}
                    error={leftLink && problem ? WORDS.linkBad[problem] : null}
                />
                <Field
                    label={WORDS.head}
                    maxLength={80}
                    value={head}
                    onChange={(e) => setHead(e.target.value)}
                />
                <Chips
                    legend={WORDS.size}
                    options={SIZES}
                    value={size}
                    onChange={setSize}
                    hint={WORDS.sizeHint}
                />
            </ToolForm>
            <div className="tp-side qc-side">
                {code ? (
                    <>
                        <div className={`rq-${size}`}>
                            <QrCard
                                label="Your review card"
                                eyebrow={WORDS.eyebrow}
                                code={
                                    <span className="rq-art">
                                        <span className="rq-stars">
                                            {STAR}
                                            {STAR}
                                            {STAR}
                                            {STAR}
                                            {STAR}
                                        </span>
                                        <QrCode
                                            text={code}
                                            label={`QR code that opens the Google review box for ${shown}`}
                                        />
                                    </span>
                                }
                                title={shown}
                                check={`${head.trim() ? `${head.trim()} ` : ""}${WORDS.scan}`}
                            />
                        </div>
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <Downloads error={pngError ? PNG_FAILED : null}>
                                <DownloadButton
                                    done={saved === "png"}
                                    onClick={() => void png(code)}
                                >
                                    {WORDS.png}
                                </DownloadButton>
                                <DownloadButton
                                    done={saved === "print"}
                                    onClick={() => {
                                        setSaved("print");
                                        window.print();
                                    }}
                                >
                                    {WORDS.print}
                                </DownloadButton>
                            </Downloads>
                        </EmailGate>
                        <span className="tp-hint">{WORDS.after}</span>
                    </>
                ) : (
                    <QrCard
                        label="Your review card"
                        eyebrow={WORDS.eyebrow}
                        code={<QrSample line={WORDS.sample} />}
                    />
                )}
            </div>
        </ToolColumns>
    );
}
