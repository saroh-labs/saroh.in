"use client";

import { useId, useState } from "react";

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
    saveFile,
    useLastGood,
} from "../qr";
import type { Contact } from "./logic";
import {
    DENSE_CHARS,
    EMAIL,
    fileName,
    phoneProblem,
    readPhone,
    vcard,
    WORDS,
} from "./logic";

type Key = keyof Contact;

/** The printed business card: the details on the left, the code on the right. */
function BusinessCard({ c, code }: { c: Contact; code: string }) {
    const line = [c.role.trim(), c.business.trim()].filter(Boolean).join(", ");
    return (
        <div className="bq-card">
            <div className="bq-card-text">
                <span className="bq-card-name">{c.name.trim()}</span>
                {line ? <span className="bq-card-role">{line}</span> : null}
                {[c.phone, c.email, c.website].map((x) =>
                    x.trim() ? <span key={x}>{x.trim()}</span> : null,
                )}
            </div>
            <div className="bq-card-code">
                <QrCode
                    text={code}
                    label={`QR code that saves ${c.name.trim()} as a phone contact`}
                />
                <span>{WORDS.scanToSave}</span>
            </div>
        </div>
    );
}

/**
 * /tools/business-card-qr-generator (design BusinessCardQr*.dc.html): a
 * vCard code that saves you into a customer's contacts, and a business
 * card to print. The phone and email are checked when they leave them;
 * while one is wrong the last good code stays. The PNG, the .vcf file and
 * the sheet of ten cards are behind the email gate.
 */
export default function BusinessCardQrGenerator() {
    const [c, setC] = useState<Contact>({
        name: "",
        role: "",
        business: "",
        phone: "",
        email: "",
        website: "",
        address: "",
    });
    const [left, setLeft] = useState<Set<Key>>(new Set());
    const [saved, setSaved] = useState<"png" | "vcf" | "print" | null>(null);
    const [pngError, setPngError] = useState(false);
    const id = useId();

    const phoneBad = c.phone.trim() !== "" && readPhone(c.phone) === null;
    const emailBad = c.email.trim() !== "" && !EMAIL.test(c.email.trim());
    const held = useLastGood<Contact>(
        c.name.trim() && readPhone(c.phone) && !emailBad ? c : null,
        phoneBad || emailBad,
        vcard,
    );
    const code = held ? vcard(held) : null;

    const field = (key: Key) => ({
        value: c[key],
        onChange: (e: { target: { value: string } }) =>
            setC((was) => ({ ...was, [key]: e.target.value })),
        onBlur: () => setLeft((was) => new Set(was).add(key)),
    });

    async function png(text: string, name: string) {
        const ok = await downloadQrPng(text, `${fileName(name)}-qr-code`);
        setPngError(!ok);
        if (ok) setSaved("png");
    }

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <div className="bq-two">
                    <Field
                        label={WORDS.name}
                        placeholder={WORDS.namePlaceholder}
                        autoComplete="name"
                        {...field("name")}
                    />
                    <Field
                        label={WORDS.role}
                        placeholder="Owner"
                        {...field("role")}
                    />
                </div>
                <Field
                    label={WORDS.business}
                    autoComplete="organization"
                    {...field("business")}
                />
                <Field
                    label={WORDS.phone}
                    hint={WORDS.phoneHint}
                    type="tel"
                    placeholder="+91"
                    autoComplete="tel"
                    error={
                        left.has("phone") && phoneBad
                            ? phoneProblem(c.phone)
                            : null
                    }
                    {...field("phone")}
                />
                <Field
                    label={WORDS.email}
                    type="email"
                    autoComplete="email"
                    error={
                        left.has("email") && emailBad ? WORDS.emailBad : null
                    }
                    {...field("email")}
                />
                <Field
                    label={WORDS.website}
                    inputMode="url"
                    autoCapitalize="none"
                    placeholder="example.com"
                    {...field("website")}
                />
                <div className="tp-field">
                    <label htmlFor={`${id}-address`} className="tp-label">
                        {WORDS.address}
                    </label>
                    <textarea
                        id={`${id}-address`}
                        rows={3}
                        aria-describedby={`${id}-address-hint`}
                        className="tp-input bq-area"
                        {...field("address")}
                    />
                    <span id={`${id}-address-hint`} className="tp-hint">
                        {code && code.length > DENSE_CHARS ? (
                            <span className="qc-warn">{WORDS.dense}</span>
                        ) : (
                            WORDS.addressHint
                        )}
                    </span>
                </div>
            </ToolForm>
            <div className="tp-side qc-side">
                {held && code ? (
                    <>
                        <QrCard
                            label="Your contact code"
                            eyebrow={WORDS.eyebrow}
                            code={
                                <QrCode
                                    text={code}
                                    label={`QR code that saves ${held.name.trim()} as a phone contact`}
                                />
                            }
                            title={held.name.trim()}
                            mono={held.phone.trim()}
                            check={WORDS.check}
                        />
                        <div className="bq-paper">
                            <BusinessCard c={held} code={code} />
                            <span className="bq-caption">{WORDS.caption}</span>
                        </div>
                        <div aria-hidden="true" className="bq-sheet">
                            {Array.from({ length: 10 }, (_, i) => (
                                <BusinessCard key={i} c={held} code={code} />
                            ))}
                        </div>
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <Downloads error={pngError ? PNG_FAILED : null}>
                                <DownloadButton
                                    done={saved === "png"}
                                    onClick={() => void png(code, held.name)}
                                >
                                    {WORDS.png}
                                </DownloadButton>
                                <DownloadButton
                                    done={saved === "vcf"}
                                    onClick={() => {
                                        saveFile(
                                            new Blob([code], {
                                                type: "text/vcard;charset=utf-8",
                                            }),
                                            `${fileName(held.name)}.vcf`,
                                        );
                                        setSaved("vcf");
                                    }}
                                >
                                    {WORDS.vcf}
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
                        label="Your contact code"
                        eyebrow={WORDS.eyebrow}
                        code={<QrSample line={WORDS.sample} />}
                    />
                )}
            </div>
        </ToolColumns>
    );
}
