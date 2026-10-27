"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";

import { EmailGate } from "../email-gate";
import { Field, Note, ToolColumns, ToolForm } from "../parts";
import { DownloadButton, Downloads, saveFile } from "../qr";
import type { BioLink, Colour, Kind } from "./logic";
import {
    COLOURS,
    fileName,
    initials,
    KINDS,
    linkProblem,
    MAX_LINKS,
    pageButtons,
    pageHtml,
    PHOTO_MAX_BYTES,
    PHOTO_TYPES,
    START_LINKS,
    WORDS,
} from "./logic";

const ICON: Record<Kind, ReactNode> = {
    whatsapp: (
        <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z" />
    ),
    booking: (
        <>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
        </>
    ),
    maps: (
        <>
            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
        </>
    ),
    upi: (
        <>
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M3 10h18M7 15h4" />
        </>
    ),
    link: (
        <>
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </>
    ),
};

/** A photo chosen in the page, read as a data: URL (it never leaves the browser). */
function readPhoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
            typeof reader.result === "string"
                ? resolve(reader.result)
                : reject(new Error("not a data URL"));
        reader.onerror = () => reject(new Error("unreadable"));
        reader.readAsDataURL(file);
    });
}

/**
 * /tools/link-in-bio-page-maker (design LinkInBio*.dc.html): one page of
 * buttons (WhatsApp, booking, map, UPI) in the merchant's colour, drawn as
 * they type and downloaded as one HTML file for any web host. No hosting
 * and no Saroh branding on the page. A link is checked when they leave it;
 * until it's right its button waits. The file is behind the email gate.
 */
export default function LinkInBioPageMaker() {
    const [name, setName] = useState("");
    const [about, setAbout] = useState("");
    const [photo, setPhoto] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [links, setLinks] = useState<BioLink[]>(() => [...START_LINKS]);
    const [left, setLeft] = useState<Set<number>>(new Set());
    const [colour, setColour] = useState<Colour>("#0F5C5C");
    const [saved, setSaved] = useState(false);
    const id = useId();

    const page = { name, about, photo, links, colour };
    const buttons = pageButtons(links, name);
    const ready = name.trim() !== "";
    const hasUpi = buttons.some((b) => b.kind === "upi");

    const setLink = (i: number, key: "text" | "value", value: string) =>
        setLinks((was) =>
            was.map((l, j) => (j === i ? { ...l, [key]: value } : l)),
        );

    async function choosePhoto(file: File | undefined) {
        setPhotoError(null);
        if (!file) return;
        if (!PHOTO_TYPES.includes(file.type)) {
            setPhotoError(WORDS.photoBad);
            return;
        }
        if (file.size > PHOTO_MAX_BYTES) {
            setPhotoError(WORDS.photoBig);
            return;
        }
        try {
            setPhoto(await readPhoto(file));
        } catch {
            setPhotoError(WORDS.photoBad);
        }
    }

    return (
        <ToolColumns>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.name}
                    placeholder="Rye Studio"
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <Field
                    label={WORDS.about}
                    placeholder="Hair and skin studio, Indiranagar, Bengaluru"
                    maxLength={120}
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                />
                <div className="tp-field">
                    <label htmlFor={`${id}-photo`} className="tp-label">
                        {WORDS.photo}
                    </label>
                    <input
                        id={`${id}-photo`}
                        type="file"
                        accept={PHOTO_TYPES.join(",")}
                        aria-describedby={`${id}-photo-said`}
                        className="lb-file"
                        onChange={(e) => void choosePhoto(e.target.files?.[0])}
                    />
                    {photoError ? (
                        <span
                            id={`${id}-photo-said`}
                            role="alert"
                            className="tp-error"
                        >
                            {photoError}
                        </span>
                    ) : (
                        <span id={`${id}-photo-said`} className="tp-hint">
                            {WORDS.photoHint}
                        </span>
                    )}
                    {photo ? (
                        <button
                            type="button"
                            className="tp-linkbtn lb-remove-photo"
                            onClick={() => setPhoto(null)}
                        >
                            {WORDS.photoRemove}
                        </button>
                    ) : null}
                </div>
                <fieldset className="lb-links">
                    <legend className="tp-label">{WORDS.links}</legend>
                    {links.map((l, i) => {
                        const problem = left.has(i) ? linkProblem(l) : null;
                        return (
                            <div key={i} className="lb-link">
                                <div className="lb-link-row">
                                    <Field
                                        label={WORDS.buttonText}
                                        maxLength={40}
                                        value={l.text}
                                        onChange={(e) =>
                                            setLink(i, "text", e.target.value)
                                        }
                                    />
                                    <Field
                                        label={KINDS[l.kind].label}
                                        placeholder={KINDS[l.kind].placeholder}
                                        inputMode={
                                            l.kind === "whatsapp"
                                                ? "tel"
                                                : l.kind === "upi"
                                                  ? "email"
                                                  : "url"
                                        }
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        value={l.value}
                                        onChange={(e) =>
                                            setLink(i, "value", e.target.value)
                                        }
                                        onBlur={() =>
                                            setLeft((was) =>
                                                new Set(was).add(i),
                                            )
                                        }
                                        error={problem}
                                    />
                                    <button
                                        type="button"
                                        aria-label={WORDS.remove(l.text.trim())}
                                        className="lb-x"
                                        onClick={() => {
                                            setLinks((was) =>
                                                was.filter((_, j) => j !== i),
                                            );
                                            setLeft(new Set());
                                        }}
                                    >
                                        <svg
                                            aria-hidden="true"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M6 6l12 12M18 6 6 18" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {links.length < MAX_LINKS ? (
                        <button
                            type="button"
                            className="qc-add lb-add"
                            onClick={() =>
                                setLinks((was) => [
                                    ...was,
                                    { kind: "link", text: "", value: "" },
                                ])
                            }
                        >
                            <svg
                                aria-hidden="true"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            {WORDS.add}
                        </button>
                    ) : (
                        <span className="tp-hint">{WORDS.full}</span>
                    )}
                </fieldset>
                <fieldset className="tp-chips">
                    <legend className="tp-label">{WORDS.colour}</legend>
                    <div className="tp-chip-row">
                        {COLOURS.map((c) => (
                            <label
                                key={c.value}
                                className={`tp-chip lb-swatch ${c.value === colour ? "lb-swatch-on" : ""}`}
                            >
                                <input
                                    type="radio"
                                    name={`${id}-colour`}
                                    value={c.value}
                                    checked={c.value === colour}
                                    onChange={() => setColour(c.value)}
                                    className="tp-chip-input"
                                />
                                <span
                                    aria-hidden="true"
                                    className="lb-dot"
                                    style={{ background: c.value }}
                                />
                                {c.label}
                            </label>
                        ))}
                    </div>
                    <span className="tp-hint tp-chips-hint">
                        {WORDS.colourHint}
                    </span>
                </fieldset>
            </ToolForm>
            <div className="tp-side qc-side">
                <section aria-label={WORDS.preview} className="lb-panel">
                    <span className="qc-eyebrow">{WORDS.preview}</span>
                    <div
                        role="group"
                        aria-label="Preview of your page"
                        className={`lb-phone ${ready ? "" : "lb-faded"}`}
                    >
                        {photo ? (
                            <img src={photo} alt="" className="lb-av" />
                        ) : (
                            <span
                                aria-hidden="true"
                                className="lb-av"
                                style={{
                                    background: ready ? colour : "#1C1C1A",
                                }}
                            >
                                {initials(name.trim() || "Your business")}
                            </span>
                        )}
                        <span className="lb-name">
                            {name.trim() || "Your business"}
                        </span>
                        <span className="lb-about">
                            {about.trim() ||
                                (ready ? "" : "One line about you")}
                        </span>
                        <div className="lb-buttons">
                            {buttons.map((b, i) => (
                                <span
                                    key={i}
                                    className="lb-button"
                                    style={{ background: colour }}
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
                                        {ICON[b.kind]}
                                    </svg>
                                    {b.text}
                                </span>
                            ))}
                        </div>
                        {hasUpi && ready ? (
                            <Note>{WORDS.upiNote(name.trim())}</Note>
                        ) : null}
                    </div>
                    {ready ? (
                        <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                            <Downloads>
                                <DownloadButton
                                    done={saved}
                                    onClick={() => {
                                        saveFile(
                                            new Blob([pageHtml(page)], {
                                                type: "text/html;charset=utf-8",
                                            }),
                                            `${fileName(name)}.html`,
                                        );
                                        setSaved(true);
                                    }}
                                >
                                    {WORDS.download}
                                </DownloadButton>
                            </Downloads>
                        </EmailGate>
                    ) : (
                        <span className="tp-hint lb-empty">{WORDS.empty}</span>
                    )}
                    <span className="tp-hint">{WORDS.host}</span>
                </section>
            </div>
        </ToolColumns>
    );
}
