"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Pill } from "../links/pill";
import { ring } from "../ring";
import { useBrowserValue } from "../use-browser-value";
import { BlockFrame } from "./block-frame";
import { RadioGroup } from "./radio-group";
import type { TryVisitor, TryWords } from "./try-panel";
import { TryPanel } from "./try-panel";
import type {
    LibraryBlock,
    LibraryControl,
    LibraryGroup,
    LibraryLayout,
    LibraryWords,
} from "./types";

/** The toolbar's choices by address key; a key left out is its default. */
export type LibraryChoice = Readonly<Record<string, string>>;

/** Each control's value in `search`, where it is one of its options. */
export function choiceFrom(
    controls: readonly LibraryControl[],
    search: string,
): Record<string, string> {
    const query = new URLSearchParams(search);
    const out: Record<string, string> = {};
    for (const c of controls) {
        const value = query.get(c.key);
        if (value !== null && c.options.some((o) => o.value === value)) {
            out[c.key] = value;
        }
    }
    return out;
}

/** `href` with the toolbar's keys set to `choice`, defaults left out. */
export function withChoice(
    controls: readonly LibraryControl[],
    choice: LibraryChoice,
    href: string,
): string {
    const url = new URL(href);
    for (const c of controls) {
        const value = choice[c.key];
        if (value && value !== c.options[0].value) {
            url.searchParams.set(c.key, value);
        } else {
            url.searchParams.delete(c.key);
        }
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The library's blocks (DEC-228, U11): the toolbar, then a card per block
 * in its group, each with its layouts and a live preview. The page is one
 * built file, so the toolbar reads its choices from the address in the
 * browser (`read`, the edition's own reader) and writes them back as they
 * change, so a reload or a shared link keeps them. Every word and layout is
 * drawn on the server; only the previews wait for the address.
 */
export function LibraryBlocks({
    groups,
    controls,
    componentControls,
    words,
    read,
    previewSrc,
    frameWidth,
    tryIt,
}: {
    groups: readonly LibraryGroup[];
    /** Look, colours, desk or phone. */
    controls: readonly LibraryControl[];
    /** One per kind of component, folded under `words.toolbar.components`. */
    componentControls: readonly LibraryControl[];
    words: LibraryWords;
    /** The page's query as it was opened (`?…`). */
    read: () => string;
    previewSrc: (layout: LibraryLayout, choice: LibraryChoice) => string;
    frameWidth: (choice: LibraryChoice) => number;
    /**
     * "Try it on your business" (U12): its words, the trades, which toolbar
     * key is the colourway, and sign-up's address for what was picked.
     */
    tryIt?: {
        words: TryWords;
        trades: LibraryControl;
        colourKey: string;
        startHref: (picked: {
            name?: string;
            trade: string;
            colour: string;
        }) => string;
        onStart?: () => void;
    };
}) {
    // The address as opened (null on the server and the first render), then
    // what the visitor picks here.
    const opened = useBrowserValue<string | null>(read, null);
    const [picked, setPicked] = useState<LibraryChoice | null>(null);
    // The component styles start folded, unless the address picked one.
    const [foldOpen, setOpen] = useState<boolean | null>(null);
    const ready = opened !== null;
    const choice =
        picked ??
        (opened === null
            ? {}
            : choiceFrom([...controls, ...componentControls], opened));

    const change = (key: string, value: string) => {
        const next = { ...choice, [key]: value };
        setPicked(next);
        window.history.replaceState(
            window.history.state,
            "",
            withChoice(
                [...controls, ...componentControls],
                next,
                window.location.href,
            ),
        );
    };
    const open =
        foldOpen ??
        componentControls.some((c) => {
            const v = choice[c.key];
            return Boolean(v) && v !== c.options[0].value;
        });
    const valueOf = (c: LibraryControl) => choice[c.key] ?? c.options[0].value;
    const width = frameWidth(choice);
    // What the visitor typed into Try: this page's memory only (KD12).
    const [visitor, setVisitor] = useState<TryVisitor>({
        name: "",
        town: "",
        trade: tryIt?.trades.options[0].value ?? "",
    });
    const colours = controls.find((c) => c.key === tryIt?.colourKey);
    const tried = { name: visitor.name.trim(), town: visitor.town.trim() };

    return (
        <div className="grid gap-12">
            {tryIt && colours ? (
                <TryPanel
                    words={tryIt.words}
                    trades={tryIt.trades}
                    colours={colours}
                    colour={valueOf(colours)}
                    onColour={(v) => change(colours.key, v)}
                    visitor={visitor}
                    onChange={setVisitor}
                    startHref={tryIt.startHref}
                    onStart={tryIt.onStart}
                />
            ) : null}
            <div
                role="group"
                aria-label={words.toolbar.label}
                className="grid gap-5 rounded-2xl border border-border bg-card p-5"
            >
                <div className="flex flex-wrap gap-x-8 gap-y-5">
                    {controls.map((c) => (
                        <RadioGroup
                            key={c.key}
                            control={c}
                            value={valueOf(c)}
                            onChange={(v) => change(c.key, v)}
                        />
                    ))}
                </div>
                {componentControls.length > 0 ? (
                    <div className="grid gap-3">
                        <button
                            type="button"
                            aria-expanded={open}
                            aria-controls="library-components"
                            onClick={() => setOpen(!open)}
                            className={`flex min-h-[44px] w-fit cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-[15px] font-semibold text-foreground ${ring()}`}
                        >
                            {words.toolbar.components}
                            <ChevronDown
                                aria-hidden
                                className={`size-4 transition-transform duration-fast ${open ? "rotate-180" : ""}`}
                            />
                        </button>
                        <div
                            id="library-components"
                            hidden={!open}
                            className="flex flex-wrap gap-x-8 gap-y-5"
                        >
                            {componentControls.map((c) => (
                                <RadioGroup
                                    key={c.key}
                                    control={c}
                                    value={valueOf(c)}
                                    onChange={(v) => change(c.key, v)}
                                />
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
            {groups.map((g, i) => (
                <section
                    key={g.name}
                    aria-labelledby={`library-group-${i}`}
                    className="grid gap-6"
                >
                    <h3
                        id={`library-group-${i}`}
                        className="m-0 font-display text-mk-kit-h3 font-bold text-foreground"
                    >
                        {g.name}
                    </h3>
                    <div className="grid gap-6 min-[1000px]:grid-cols-2">
                        {g.blocks.map((b) => (
                            <BlockCard
                                key={b.id}
                                block={b}
                                words={words}
                                src={(layout) =>
                                    ready ? previewSrc(layout, choice) : null
                                }
                                width={width}
                                tried={tried}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

function BlockCard({
    block,
    words,
    src,
    width,
    tried,
}: {
    block: LibraryBlock;
    words: LibraryWords;
    src: (layout: LibraryLayout) => string | null;
    width: number;
    tried: { name: string; town: string };
}) {
    const [picked, setPicked] = useState(0);
    const layout = block.layouts.length > 0 ? block.layouts[picked] : null;
    return (
        <article
            aria-labelledby={`block-${block.id}`}
            data-block={block.id}
            className="grid min-w-0 content-start gap-4 rounded-2xl border border-border bg-background p-5"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h4
                    id={`block-${block.id}`}
                    className="m-0 text-[20px] font-semibold text-foreground"
                >
                    {block.name}
                </h4>
                {block.coming ? (
                    <Pill tone="soon">{words.card.coming}</Pill>
                ) : null}
            </div>
            <p className="m-0 text-[15px] text-mk-copy">{block.what}</p>
            <p className="m-0 text-[14px] text-muted-foreground">
                {block.linked}
            </p>
            {block.layouts.length > 1 ? (
                <RadioGroup
                    control={{
                        key: "layout",
                        label: words.card.layouts,
                        options: [
                            { value: "0", label: block.layouts[0].label },
                            ...block.layouts.slice(1).map((l, i) => ({
                                value: String(i + 1),
                                label: l.label,
                            })),
                        ],
                    }}
                    value={String(picked)}
                    onChange={(v) => setPicked(Number(v))}
                />
            ) : null}
            {layout ? (
                <BlockFrame
                    src={src(layout)}
                    width={width}
                    title={`${block.name}, ${layout.label} layout, preview`}
                    name={block.name}
                    loading={words.card.loading}
                    failed={words.card.failed}
                    tried={tried}
                />
            ) : null}
        </article>
    );
}
