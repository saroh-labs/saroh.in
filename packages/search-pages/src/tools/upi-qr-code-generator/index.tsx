"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { Field, ToolColumns, ToolForm } from "../parts";
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
import type { UpiInput } from "./logic";
import { isUpiId, readAmount, upiLink, WORDS } from "./logic";

type Key = "upiId" | "name" | "amount" | "note";

/**
 * /tools/upi-qr-code-generator (design UpiQr*.dc.html, #1207): the code is
 * drawn as they type; the UPI ID and amount are checked when they leave the
 * field, and while one is wrong the last good code stays. The code is free
 * to see; the PNG and the counter card are behind the email gate. Nothing
 * typed leaves the browser.
 */
export default function UpiQrCodeGenerator() {
    const [v, setV] = useState<Record<Key, string>>({
        upiId: "",
        name: "",
        amount: "",
        note: "",
    });
    const [left, setLeft] = useState<Set<Key>>(new Set());
    const [saved, setSaved] = useState<"png" | "card" | null>(null);
    const [pngError, setPngError] = useState(false);

    const idBad = v.upiId.trim() !== "" && !isUpiId(v.upiId);
    const amountBad = v.amount.trim() !== "" && readAmount(v.amount) === null;
    const held = useLastGood<UpiInput>(
        isUpiId(v.upiId) && v.name.trim() && !amountBad
            ? {
                  upiId: v.upiId.trim(),
                  name: v.name.trim(),
                  amount: readAmount(v.amount),
                  note: v.note,
              }
            : null,
        idBad || amountBad,
        upiLink,
    );
    const code = held ? upiLink(held) : null;

    const field = (key: Key) => ({
        value: v[key],
        onChange: (e: { target: { value: string } }) =>
            setV((was) => ({ ...was, [key]: e.target.value })),
        onBlur: () => setLeft((was) => new Set(was).add(key)),
    });

    async function png(text: string) {
        const ok = await downloadQrPng(text, "upi-qr-code");
        setPngError(!ok);
        if (ok) setSaved("png");
    }

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.upiId}
                    hint={WORDS.upiIdHint}
                    placeholder="name@bank"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="qc-input-mono"
                    error={left.has("upiId") && idBad ? WORDS.upiIdBad : null}
                    {...field("upiId")}
                />
                <Field
                    label={WORDS.name}
                    hint={WORDS.nameHint}
                    placeholder="As on your bank account"
                    {...field("name")}
                />
                <Field
                    label={`${WORDS.amount} (optional)`}
                    inputMode="decimal"
                    prefix="₹"
                    placeholder={WORDS.amountPlaceholder}
                    error={
                        left.has("amount") && amountBad ? WORDS.amountBad : null
                    }
                    {...field("amount")}
                />
                <Field
                    label={`${WORDS.note} (optional)`}
                    placeholder={WORDS.notePlaceholder}
                    maxLength={50}
                    {...field("note")}
                />
            </ToolForm>
            <div className="tp-side qc-side">
                {held && code ? (
                    <>
                        <QrCard
                            label="Your QR code"
                            eyebrow={WORDS.eyebrow}
                            code={
                                <QrCode
                                    text={code}
                                    label={`QR code for paying ${held.name} by UPI`}
                                />
                            }
                            title={held.name}
                            mono={held.upiId}
                            check={
                                <>
                                    Check the name your UPI app shows is{" "}
                                    <b>{held.name}</b> before you pay.
                                </>
                            }
                        />
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <Downloads error={pngError ? PNG_FAILED : null}>
                                <DownloadButton
                                    done={saved === "png"}
                                    onClick={() => void png(code)}
                                >
                                    {WORDS.png}
                                </DownloadButton>
                                <DownloadButton
                                    done={saved === "card"}
                                    onClick={() => {
                                        setSaved("card");
                                        window.print();
                                    }}
                                >
                                    {WORDS.card}
                                </DownloadButton>
                                <span className="tp-hint">
                                    {WORDS.cardLine}
                                </span>
                            </Downloads>
                        </EmailGate>
                        <span className="tp-hint">{WORDS.after}</span>
                    </>
                ) : (
                    <QrCard
                        label="Your QR code"
                        eyebrow={WORDS.eyebrow}
                        code={
                            <QrSample
                                line={
                                    isUpiId(v.upiId) && !v.name.trim()
                                        ? WORDS.needName
                                        : WORDS.sample
                                }
                            />
                        }
                    />
                )}
            </div>
        </ToolColumns>
    );
}
