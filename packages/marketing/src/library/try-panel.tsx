"use client";

import type { MouseEvent } from "react";
import { useId } from "react";

import { buttonClasses } from "../buttons/button";
import { fieldClasses } from "../fields/field-classes";
import { RadioGroup } from "./radio-group";
import type { LibraryControl } from "./types";

/** What the visitor typed: only ever in this page's memory. */
export interface TryVisitor {
    name: string;
    town: string;
    trade: string;
}

/** The longest name and town the panel takes (a business name's limit). */
export const TRY_NAME_MAX = 120;
export const TRY_TOWN_MAX = 80;

export interface TryWords {
    title: string;
    lead: string;
    name: string;
    town: string;
    namePlaceholder: string;
    townPlaceholder: string;
    /** The colour group's label, apart from the toolbar's. */
    colour: string;
    note: string;
    start: string;
}

/**
 * "Try it on your business" (plan 2026-11-18-001 U12; board LPTry): a
 * business name, a town, a trade and a colourway. The previews take the
 * name and town by message (`BlockFrame`); nothing is saved, and none of it
 * is ever written to this page's address (DEC-127, KD12).
 *
 * "Use this for my business" carries name, trade and colour to sign-up, on
 * the link it follows only. Its `href` is the link without the name, and a
 * click goes to the full one: a tag that reports outbound links (Google's
 * enhanced measurement) reads the `href`, so it never sees a business name.
 */
export function TryPanel({
    words,
    trades,
    colours,
    colour,
    onColour,
    visitor,
    onChange,
    startHref,
    onStart,
}: {
    words: TryWords;
    trades: LibraryControl;
    /** The toolbar's colourway control: the same choice as the previews'. */
    colours: LibraryControl;
    colour: string;
    onColour: (value: string) => void;
    visitor: TryVisitor;
    onChange: (next: TryVisitor) => void;
    /** Sign-up's address with what the visitor picked (and, with `name`, typed). */
    startHref: (picked: {
        name?: string;
        trade: string;
        colour: string;
    }) => string;
    onStart?: () => void;
}) {
    const id = useId();
    const picked = { trade: visitor.trade, colour };
    const follow = (e: MouseEvent<HTMLAnchorElement>) => {
        onStart?.();
        // A new tab or window gets the plain link: no name in it.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
            return;
        e.preventDefault();
        window.location.assign(startHref({ ...picked, name: visitor.name }));
    };
    return (
        <section
            aria-labelledby={`${id}-title`}
            className="grid gap-5 rounded-2xl border border-border bg-card p-5"
        >
            <div className="grid gap-2">
                <h3
                    id={`${id}-title`}
                    className="m-0 font-display text-mk-kit-h3 font-bold text-foreground"
                >
                    {words.title}
                </h3>
                <p className="m-0 max-w-[60ch] text-[16px] text-mk-copy">
                    {words.lead}
                </p>
            </div>
            <div className="grid gap-4 min-[760px]:grid-cols-2">
                <label className="grid gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">
                        {words.name}
                    </span>
                    <input
                        value={visitor.name}
                        onChange={(e) =>
                            onChange({ ...visitor, name: e.target.value })
                        }
                        maxLength={TRY_NAME_MAX}
                        autoComplete="organization"
                        placeholder={words.namePlaceholder}
                        data-ph-mask=""
                        className={fieldClasses({ className: "h-11 w-full" })}
                    />
                </label>
                <label className="grid gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">
                        {words.town}
                    </span>
                    <input
                        value={visitor.town}
                        onChange={(e) =>
                            onChange({ ...visitor, town: e.target.value })
                        }
                        maxLength={TRY_TOWN_MAX}
                        autoComplete="address-level2"
                        placeholder={words.townPlaceholder}
                        data-ph-mask=""
                        className={fieldClasses({ className: "h-11 w-full" })}
                    />
                </label>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-5">
                <RadioGroup
                    control={trades}
                    value={visitor.trade}
                    onChange={(trade) => onChange({ ...visitor, trade })}
                />
                <RadioGroup
                    control={{ ...colours, label: words.colour }}
                    value={colour}
                    onChange={onColour}
                />
            </div>
            <p className="m-0 text-[14px] text-muted-foreground">
                {words.note}
            </p>
            <a
                href={startHref(picked)}
                onClick={follow}
                className={buttonClasses({
                    size: "kit",
                    className: "w-fit",
                })}
            >
                {words.start}
            </a>
        </section>
    );
}
