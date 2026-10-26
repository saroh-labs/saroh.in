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
import type { Favourite, Source } from "./logic";
import {
    cardFavourites,
    isDriveLink,
    MAX_FAVOURITES,
    menuLinkProblem,
    shortLink,
    SOURCES,
    WORDS,
} from "./logic";

/**
 * /tools/menu-qr-code-generator (design MenuQr*.dc.html): a code for the
 * link where the menu already lives, on a table card with a table number
 * and a few favourites. Nothing is uploaded; a PDF or photo menu is told to
 * get a link first. The link is checked when they leave it; while it's
 * wrong the last good card stays. Printing and the PNG are behind the gate.
 */
export default function MenuQrCodeGenerator() {
    const [name, setName] = useState("");
    const [source, setSource] = useState<Source>("link");
    const [link, setLink] = useState("");
    const [table, setTable] = useState("");
    const [rows, setRows] = useState<Favourite[]>([{ name: "", price: "" }]);
    const [leftLink, setLeftLink] = useState(false);
    const [saved, setSaved] = useState<"png" | "print" | null>(null);
    const [pngError, setPngError] = useState(false);

    const problem = link.trim() ? menuLinkProblem(link) : null;
    const code = useLastGood(
        link.trim() && !problem ? link.trim() : null,
        problem !== null,
    );
    const favourites = cardFavourites(rows);
    const shown = name.trim() || "Your menu";

    const setRow = (i: number, key: keyof Favourite, value: string) =>
        setRows((was) =>
            was.map((r, j) => (j === i ? { ...r, [key]: value } : r)),
        );

    async function png(text: string) {
        const ok = await downloadQrPng(text, "menu-qr-code");
        setPngError(!ok);
        if (ok) setSaved("png");
    }

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.name}
                    placeholder="Northwind Bakes"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <Chips
                    legend={WORDS.source}
                    options={SOURCES}
                    value={source}
                    onChange={setSource}
                    hint={source === "file" ? WORDS.sourceHint.file : undefined}
                />
                <Field
                    label={WORDS.link}
                    placeholder="https://…"
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="qc-input-mono"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    onBlur={() => setLeftLink(true)}
                    error={leftLink && problem ? WORDS.linkBad : null}
                    hint={
                        !problem && isDriveLink(link) ? (
                            <span className="qc-warn">{WORDS.drive}</span>
                        ) : (
                            WORDS.linkHint
                        )
                    }
                />
                <Field
                    label={WORDS.table}
                    hint={WORDS.tableHint}
                    placeholder="4"
                    maxLength={12}
                    value={table}
                    onChange={(e) => setTable(e.target.value)}
                />
                <fieldset className="mq-items">
                    <legend className="tp-label">{WORDS.favourites}</legend>
                    {rows.map((r, i) => (
                        <div key={i} className="mq-item">
                            <input
                                aria-label={`Item ${i + 1} name`}
                                placeholder={i === 0 ? "Masala chai" : ""}
                                maxLength={40}
                                value={r.name}
                                onChange={(e) =>
                                    setRow(i, "name", e.target.value)
                                }
                                className="tp-input"
                            />
                            <div className="tp-affix">
                                <span aria-hidden="true" className="tp-pre">
                                    ₹
                                </span>
                                <input
                                    aria-label={`Item ${i + 1} price in rupees`}
                                    inputMode="decimal"
                                    placeholder={i === 0 ? "40" : ""}
                                    value={r.price}
                                    onChange={(e) =>
                                        setRow(i, "price", e.target.value)
                                    }
                                    className="tp-input tp-input-pre"
                                />
                            </div>
                        </div>
                    ))}
                    {rows.length < MAX_FAVOURITES ? (
                        <button
                            type="button"
                            className="qc-add"
                            onClick={() =>
                                setRows((was) => [
                                    ...was,
                                    { name: "", price: "" },
                                ])
                            }
                        >
                            {WORDS.add}
                        </button>
                    ) : (
                        <span className="tp-hint">{WORDS.full}</span>
                    )}
                </fieldset>
            </ToolForm>
            <div className="tp-side qc-side">
                {code ? (
                    <>
                        <QrCard
                            label="Your table card"
                            eyebrow={WORDS.eyebrow}
                            code={
                                <QrCode
                                    text={code}
                                    label={`QR code that opens the ${shown} menu`}
                                />
                            }
                            title={shown}
                            mono={shortLink(code)}
                        >
                            {table.trim() ? (
                                <span className="mq-table">
                                    Table {table.trim()}
                                </span>
                            ) : null}
                            {favourites.length ? (
                                <div className="mq-favs">
                                    <span className="mq-favs-h">
                                        {WORDS.today}
                                    </span>
                                    {favourites.map((f, i) => (
                                        <div key={i} className="mq-fav">
                                            <span>{f.name}</span>
                                            <span
                                                aria-hidden="true"
                                                className="mq-dots"
                                            />
                                            <span className="mq-price">
                                                {f.price}
                                            </span>
                                        </div>
                                    ))}
                                </div>
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
                        label="Your table card"
                        eyebrow={WORDS.eyebrow}
                        code={<QrSample line={WORDS.sample} />}
                    />
                )}
            </div>
        </ToolColumns>
    );
}
