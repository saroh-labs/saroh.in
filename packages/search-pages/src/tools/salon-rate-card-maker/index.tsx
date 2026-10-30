"use client";

import { useState } from "react";

import { EmailGate } from "../email-gate";
import { Chips, Field, ToolColumns, ToolForm, ToolSide } from "../parts";
import {
    Check,
    Hint,
    Marked,
    Opt,
    Paper,
    PrintButton,
    Small,
} from "../td-parts";
import type { Service, Size } from "./logic";
import {
    A5_FITS,
    cardSections,
    OWN_SECTION,
    price,
    SIZES,
    STARTERS,
    ticked,
    WORDS,
} from "./logic";

/**
 * /tools/salon-rate-card-maker (design SalonRateCard*.dc.html): the card
 * redraws as they type. Building it is free; printing it (or saving it as
 * a PDF) is behind the email gate. There's no image download: drawing one
 * in the browser would need a heavy library, so the gate offers print and
 * save as PDF and says so. Nothing typed leaves the browser.
 */
export default function SalonRateCardMaker() {
    const [biz, setBiz] = useState("");
    const [tag, setTag] = useState("");
    const [phone, setPhone] = useState("");
    const [services, setServices] = useState<Service[]>([...STARTERS]);
    const [size, setSize] = useState<Size>("a5");
    const [gst, setGst] = useState(true);
    const [left, setLeft] = useState<Set<string>>(new Set());

    const edit = (id: string, patch: Partial<Service>) =>
        setServices(
            services.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        );
    const add = () =>
        setServices([
            ...services,
            {
                id: `own${services.length}`,
                section: OWN_SECTION,
                name: "",
                price: "",
                time: "",
                on: true,
                own: true,
            },
        ]);

    const sections = [...new Set(services.map((s) => s.section))];
    const card = cardSections(services);
    const count = ticked(services);
    const faint = !biz.trim() && services.every((s) => !s.price.trim());
    const problem = (s: Service) =>
        s.on && s.name.trim() && left.has(s.id) && !price(s.price)
            ? WORDS.noPrice(s.name.trim())
            : null;

    return (
        <ToolColumns>
            <style>{`@media print { @page { size: ${size === "a5" ? "A5" : "A4"}; margin: 12mm; } }`}</style>
            <ToolForm label={WORDS.form}>
                <Field
                    label={WORDS.biz}
                    placeholder="Your salon's name"
                    value={biz}
                    onChange={(e) => setBiz(e.target.value)}
                />
                <Field
                    label={
                        <>
                            {WORDS.tag}
                            <Opt />
                        </>
                    }
                    placeholder="Hair, skin and nails"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                />
                <Field
                    label={WORDS.phone}
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />
                {sections.map((sec) => (
                    <fieldset key={sec} className="rc-section">
                        <legend className="rc-legend">{sec}</legend>
                        {services
                            .filter((s) => s.section === sec)
                            .map((s) => {
                                const err = problem(s);
                                const name = s.name.trim() || WORDS.ownName;
                                return (
                                    <div key={s.id} className="rc-row">
                                        <div className="rc-line">
                                            {s.own ? (
                                                <span className="rc-own">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Show ${name}`}
                                                        checked={s.on}
                                                        onChange={(e) =>
                                                            edit(s.id, {
                                                                on: e.target
                                                                    .checked,
                                                            })
                                                        }
                                                        className="td-check-box"
                                                    />
                                                    <input
                                                        aria-label={
                                                            WORDS.ownName
                                                        }
                                                        placeholder="Keratin treatment"
                                                        value={s.name}
                                                        onChange={(e) =>
                                                            edit(s.id, {
                                                                name: e.target
                                                                    .value,
                                                            })
                                                        }
                                                        className="tp-input rc-input"
                                                    />
                                                </span>
                                            ) : (
                                                <Check
                                                    label={s.name}
                                                    checked={s.on}
                                                    onChange={(on) =>
                                                        edit(s.id, { on })
                                                    }
                                                />
                                            )}
                                            <span className="rc-cells">
                                                <input
                                                    aria-label={WORDS.priceOf(
                                                        name,
                                                    )}
                                                    aria-invalid={
                                                        err ? true : undefined
                                                    }
                                                    inputMode="decimal"
                                                    placeholder="₹"
                                                    value={s.price}
                                                    onChange={(e) =>
                                                        edit(s.id, {
                                                            price: e.target
                                                                .value,
                                                        })
                                                    }
                                                    onBlur={() =>
                                                        setLeft((was) =>
                                                            new Set(was).add(
                                                                s.id,
                                                            ),
                                                        )
                                                    }
                                                    className="tp-input rc-input"
                                                />
                                                <input
                                                    aria-label={WORDS.timeOf(
                                                        name,
                                                    )}
                                                    placeholder="45 min"
                                                    value={s.time}
                                                    onChange={(e) =>
                                                        edit(s.id, {
                                                            time: e.target
                                                                .value,
                                                        })
                                                    }
                                                    className="tp-input rc-input"
                                                />
                                            </span>
                                        </div>
                                        {err ? (
                                            <span
                                                role="alert"
                                                className="tp-error"
                                            >
                                                {err}
                                            </span>
                                        ) : null}
                                    </div>
                                );
                            })}
                    </fieldset>
                ))}
                <button type="button" className="rc-add" onClick={add}>
                    {WORDS.add}
                </button>
                <Chips
                    legend={WORDS.size}
                    options={SIZES}
                    value={size}
                    onChange={setSize}
                />
                {size === "a5" && count > A5_FITS ? (
                    <div className="td-stack">
                        <Hint>{WORDS.tooLong(count)}</Hint>
                        <button
                            type="button"
                            className="td-btn td-btn-light"
                            onClick={() => setSize("a4")}
                        >
                            {WORDS.toA4}
                        </button>
                    </div>
                ) : null}
                <Check
                    label={WORDS.gst}
                    hint={WORDS.gstHint}
                    checked={gst}
                    onChange={setGst}
                />
            </ToolForm>
            <ToolSide>
                <Paper
                    label={WORDS.out}
                    caption={faint ? WORDS.emptyCaption : WORDS.caption[size]}
                >
                    <div
                        role="img"
                        aria-label={`Rate card for ${biz.trim() || "your salon"}`}
                        className={
                            faint
                                ? "rc-card td-sheet td-faint"
                                : "rc-card td-sheet"
                        }
                    >
                        <div className="rc-head">
                            <span className="rc-biz">
                                {biz.trim() || "Your salon"}
                            </span>
                            <span className="rc-tag">
                                {tag.trim()
                                    ? `${WORDS.rateCard} · ${tag.trim()}`
                                    : WORDS.rateCard}
                            </span>
                        </div>
                        {card.map((sec) => (
                            <div key={sec.section} className="rc-sec">
                                <span className="rc-sec-name">
                                    {sec.section}
                                </span>
                                {sec.lines.map((l) => (
                                    <div key={l.name} className="rc-item">
                                        <span>
                                            {l.name}
                                            {l.time ? (
                                                <span className="rc-time">
                                                    {" "}
                                                    · {l.time}
                                                </span>
                                            ) : null}
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className="rc-dots"
                                        />
                                        <span className="rc-price">
                                            <Marked text={l.price} />
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ))}
                        {phone.trim() || gst ? (
                            <div className="rc-foot">
                                <span>
                                    {phone.trim()
                                        ? `Book: ${phone.trim()}`
                                        : ""}
                                </span>
                                {gst ? <span>{WORDS.gstLine}</span> : null}
                            </div>
                        ) : null}
                    </div>
                </Paper>
                <div className="td-light td-gate-wrap">
                    <EmailGate label={WORDS.gate} button={WORDS.gateButton}>
                        <PrintButton>{WORDS.print}</PrintButton>
                    </EmailGate>
                    <Small>{WORDS.gateAfter}</Small>
                </div>
            </ToolSide>
        </ToolColumns>
    );
}
