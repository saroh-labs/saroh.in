"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import type { QrTarget, QrTargets } from "@/lib/qr/targets";
import { searchTargets } from "@/lib/qr/targets";
import type { QrPlace } from "@/lib/qr/types";
import { QR_PLACE_NOTE_MAX } from "@/lib/qr/types";
import { QR_PLACES } from "@/lib/qr/words";

import type { Choice } from "./choice-group";
import { ChoiceGroup, Eyebrow, pillClass } from "./choice-group";

/** From this many products and pages, "More…" gets a search box. */
const SEARCH_FROM = 7;

function cardClass(on: boolean): string {
    return cn(
        "flex w-full min-w-0 flex-col gap-[3px] rounded-xl border-[1.5px] bg-card px-3.5 py-3 text-left text-foreground",
        on
            ? "border-foreground"
            : "border-border hover:border-border-strong active:bg-muted",
    );
}

function TargetWords({ target }: { target: QrTarget }) {
    return (
        <>
            <span className="text-sm font-semibold [overflow-wrap:anywhere]">
                {target.name}
            </span>
            <span className="font-mono text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">
                {target.address}
            </span>
        </>
    );
}

/**
 * The maker's first column ("Saroh QR Codes" design): what the code opens,
 * as cards with the name and its address in mono, then where it goes, as
 * pills.
 *
 * The cards are the real pages, most useful first. Products and pages sit
 * behind "More…", so the column stays short; one chosen there joins the
 * cards, so what is chosen is always in view.
 */
export function QrTargetPicker({
    targets,
    target,
    problem,
    place,
    placeNote,
    onTarget,
    onPlace,
    onPlaceNote,
}: {
    targets: QrTargets;
    /** The chosen target; it may be one no longer offered (a saved code's). */
    target: QrTarget | null;
    /** The API's refusal about the target, in plain words. */
    problem: string | null;
    place: QrPlace;
    placeNote: string;
    onTarget: (key: string) => void;
    onPlace: (place: QrPlace) => void;
    onPlaceNote: (note: string) => void;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const cards =
        target && !targets.main.some((t) => t.key === target.key)
            ? [...targets.main, target]
            : targets.main;
    const choices: Choice<string>[] = cards.map((t) => ({
        value: t.key,
        label: <TargetWords target={t} />,
    }));
    const found = searchTargets(targets.more, query);

    return (
        <div className="flex min-w-0 flex-col gap-2.5">
            <Eyebrow id={`${id}-opens`}>What it opens</Eyebrow>
            <ChoiceGroup
                labelledBy={`${id}-opens`}
                choices={choices}
                value={target?.key ?? null}
                onChange={onTarget}
                className="flex flex-col gap-2.5"
                itemClassName={(on) => cardClass(on)}
            />
            {problem ? (
                <p
                    role="alert"
                    className="rounded-[9px] bg-destructive-subtle px-3 py-2 text-[13px] text-destructive-subtle-foreground"
                >
                    {problem}
                </p>
            ) : null}
            {targets.more.length > 0 ? (
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`${id}-more`}
                        onClick={() => setOpen((v) => !v)}
                        className="w-fit cursor-pointer rounded-[4px] text-[13px] font-semibold text-brand underline underline-offset-2 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-muted-foreground coarse:min-h-11"
                    >
                        {open ? "Fewer" : "More… a product or a page"}
                    </button>
                    {open ? (
                        <div id={`${id}-more`} className="flex flex-col gap-2">
                            {targets.more.length >= SEARCH_FROM ? (
                                <Input
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    aria-label="Find a product or page"
                                    placeholder="Find a product or page"
                                />
                            ) : null}
                            {found.length === 0 ? (
                                <p className="text-[13px] text-muted-foreground">
                                    Nothing matches “{query.trim()}”.
                                </p>
                            ) : (
                                <ul
                                    aria-label="Products and pages"
                                    className="flex max-h-[264px] flex-col gap-2 overflow-y-auto pr-0.5"
                                >
                                    {found.map((t) => (
                                        <li key={t.key}>
                                            <button
                                                type="button"
                                                aria-pressed={
                                                    t.key === target?.key
                                                }
                                                onClick={() => {
                                                    onTarget(t.key);
                                                    setOpen(false);
                                                    setQuery("");
                                                }}
                                                className={cn(
                                                    "cursor-pointer transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                                    cardClass(
                                                        t.key === target?.key,
                                                    ),
                                                )}
                                            >
                                                <TargetWords target={t} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ) : null}
                </div>
            ) : null}

            <Eyebrow id={`${id}-place`} className="mt-2.5">
                Where it goes
            </Eyebrow>
            <ChoiceGroup
                labelledBy={`${id}-place`}
                choices={QR_PLACES.map((p) => ({
                    value: p.place,
                    label: p.name,
                }))}
                value={place}
                onChange={onPlace}
                className="flex flex-wrap gap-2"
                itemClassName={(on) => pillClass(on)}
            />
            {place === "OTHER" ? (
                <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                    Where is that?
                    <Input
                        value={placeNote}
                        maxLength={QR_PLACE_NOTE_MAX}
                        onChange={(e) => onPlaceNote(e.target.value)}
                        placeholder="Reception desk"
                        className="font-normal"
                    />
                </label>
            ) : null}
        </div>
    );
}
