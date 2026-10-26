"use client";

import { useId, useState } from "react";

import { EmailGate } from "../email-gate";
import { Chips, Field, Note, ToolColumns, ToolForm } from "../parts";
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
import type { Security } from "./logic";
import {
    passwordProblem,
    SECURITY,
    ssidTooLong,
    wifiPayload,
    WORDS,
} from "./logic";

const WIFI_ICON = (
    <svg
        aria-hidden="true"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1C1C1A"
        strokeWidth="2"
        strokeLinecap="round"
    >
        <path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M12 20h.01" />
    </svg>
);

/**
 * /tools/wifi-qr-code-generator (design WifiQr*.dc.html): the code guests
 * scan to join, on a card to print. The password is checked when they
 * leave it (8 to 63 for WPA); while it's wrong the last good card stays.
 * The password never leaves the page: the gate sends only the email.
 */
export default function WifiQrCodeGenerator() {
    const [ssid, setSsid] = useState("");
    const [password, setPassword] = useState("");
    const [shown, setShown] = useState(true);
    const [security, setSecurity] = useState<Security>("WPA");
    const [hidden, setHidden] = useState(false);
    const [printPassword, setPrintPassword] = useState(true);
    const [left, setLeft] = useState<Set<"ssid" | "password">>(new Set());
    const [saved, setSaved] = useState<"png" | "print" | null>(null);
    const [pngError, setPngError] = useState(false);
    const id = useId();

    const input = { ssid, password, security, hidden };
    const open = security === "nopass";
    const pwProblem =
        password || left.has("password") ? passwordProblem(input) : null;
    const nameLong = ssidTooLong(ssid);
    const ready = ssid.trim() !== "" && !nameLong && !passwordProblem(input);
    const held = useLastGood(
        ready ? input : null,
        nameLong || pwProblem !== null,
        wifiPayload,
    );
    const code = held ? wifiPayload(held) : null;
    const pwError = left.has("password") && !open ? pwProblem : null;

    async function png(text: string) {
        const ok = await downloadQrPng(text, "wifi-qr-code");
        setPngError(!ok);
        if (ok) setSaved("png");
    }

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.ssid}
                    hint={WORDS.ssidHint}
                    placeholder="As in your Wi-Fi list"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    onBlur={() => setLeft((was) => new Set(was).add("ssid"))}
                    error={left.has("ssid") && nameLong ? WORDS.ssidLong : null}
                />
                {open ? null : (
                    <div className="tp-field">
                        <label htmlFor={`${id}-pw`} className="tp-label">
                            {WORDS.password}
                        </label>
                        <div className="wq-pw">
                            <input
                                id={`${id}-pw`}
                                type={shown ? "text" : "password"}
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                value={password}
                                aria-invalid={pwError ? true : undefined}
                                aria-describedby={`${id}-pw-said`}
                                onChange={(e) => setPassword(e.target.value)}
                                onBlur={() =>
                                    setLeft((was) =>
                                        new Set(was).add("password"),
                                    )
                                }
                                className="tp-input qc-input-mono"
                            />
                            <button
                                type="button"
                                aria-pressed={!shown}
                                className="wq-toggle"
                                onClick={() => setShown((s) => !s)}
                            >
                                {shown ? WORDS.hide : WORDS.show}
                            </button>
                        </div>
                        {pwError ? (
                            <span
                                id={`${id}-pw-said`}
                                role="alert"
                                className="tp-error"
                            >
                                {pwError}
                            </span>
                        ) : (
                            <span id={`${id}-pw-said`} className="tp-hint">
                                {WORDS.passwordHint}
                            </span>
                        )}
                    </div>
                )}
                <Chips
                    legend={WORDS.security}
                    options={SECURITY}
                    value={security}
                    onChange={setSecurity}
                    hint={WORDS.securityHint}
                />
                {open ? <Note>{WORDS.open}</Note> : null}
                <label className="wq-check">
                    <input
                        type="checkbox"
                        checked={hidden}
                        onChange={(e) => setHidden(e.target.checked)}
                    />
                    {WORDS.hidden}
                </label>
                {open ? null : (
                    <div>
                        <label className="wq-check">
                            <input
                                type="checkbox"
                                checked={printPassword}
                                onChange={(e) =>
                                    setPrintPassword(e.target.checked)
                                }
                            />
                            {WORDS.printPassword}
                        </label>
                        <span className="tp-hint wq-check-hint">
                            {WORDS.printPasswordHint}
                        </span>
                    </div>
                )}
            </ToolForm>
            <div className="tp-side qc-side">
                {held && code ? (
                    <>
                        <QrCard
                            label="Your Wi-Fi card"
                            eyebrow={WORDS.eyebrow}
                            code={
                                <span className="rq-art">
                                    {WIFI_ICON}
                                    <QrCode
                                        text={code}
                                        label={`QR code that joins the ${held.ssid.trim()} Wi-Fi`}
                                    />
                                </span>
                            }
                            title={WORDS.title}
                            check={WORDS.check}
                        >
                            <span className="wq-net">
                                Network: <b>{held.ssid}</b>
                            </span>
                            {held.security === "nopass" ? (
                                <span className="qc-mono">
                                    {WORDS.noPassword}
                                </span>
                            ) : printPassword ? (
                                <span className="qc-mono">
                                    Password: {held.password}
                                </span>
                            ) : null}
                        </QrCard>
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
                        label="Your Wi-Fi card"
                        eyebrow={WORDS.eyebrow}
                        code={<QrSample line={WORDS.sample} />}
                    />
                )}
            </div>
        </ToolColumns>
    );
}
