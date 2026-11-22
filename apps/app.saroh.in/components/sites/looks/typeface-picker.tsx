"use client";

import { fontPairStacks } from "@saroh/site-blocks";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { noMatchLine } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useContext, useEffect, useRef, useState } from "react";

import type { StyleChoiceRules } from "@/lib/sites/style-access";
import { BrandInline, BrandPicker, PickerFoot } from "./brand-picker";
import { PaidRefusal } from "./paid-refusal";
import { useSiteFaces } from "./site-faces";

/** The default pair needs nothing fetched: said beside its name. */
const SYSTEM_NOTE = "Loads instantly";

/**
 * The Brand tab's Typeface (KTD-2; redesigned 22 Oct 2026): the pair in
 * force, set in its own face, and Change. Change opens the pairs as a
 * search (Popover and Command, as Country and the ⌘K menu are), grouped
 * "On your plan" and "Paid plans", each set in its own heading face.
 *
 * Moving the highlight tries a face on the page without saving
 * (`onTry`); Enter or a press keeps it, saving as a choice always has;
 * Escape puts the page back. A paid pair refused on this plan keeps the
 * picker open with the one line in its foot, and the line stays under
 * the row once it closes.
 */
export function TypefacePicker({
    pairs,
    active,
    rules,
    refused,
    onChoose,
    onTry,
}: {
    /** The pairs on offer, the default first. */
    pairs: { key: string; name: string }[];
    active: string | undefined;
    rules: StyleChoiceRules;
    /** The paid pair just refused, by name. */
    refused: string | null;
    /** Take a pair, as a choice: false when the plan refuses it. */
    onChoose: (key: string) => boolean;
    /** Draw a pair on the page unsaved; null puts the page back. */
    onTry?: (key: string | null) => void;
}) {
    const faces = useSiteFaces();
    // A phone's Brand sheet: the faces in place, a tap is the choice.
    const inSheet = useContext(BrandInline);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlight, setHighlight] = useState(active ?? "");
    // Leaving the tab with a face on trial puts the page back.
    const tryRef = useRef(onTry);
    useEffect(() => {
        tryRef.current = onTry;
    });
    useEffect(() => () => tryRef.current?.(null), []);
    const face = (key: string) => fontPairStacks(key, faces)?.heading;
    // The panel draws no picker without pairs, so the first is there.
    const current = pairs.find((p) => p.key === active) ?? pairs[0];
    const free = pairs.filter((p) => !rules.isPaid("fontPair", p.key));
    const paid = pairs.filter((p) => rules.isPaid("fontPair", p.key));
    const note = (key: string) =>
        key === pairs[0].key ? SYSTEM_NOTE : undefined;

    // The row's quiet line: the pair being tried, else what the pair is.
    const tried = highlight !== current.key && open;
    const rowNote = tried
        ? `Trying ${pairs.find((p) => p.key === highlight)?.name ?? ""} on the page`
        : note(current.key);

    function setOpenAndTry(next: boolean) {
        setOpen(next);
        setSearch("");
        setHighlight(current.key);
        // Closing without a choice puts the page back.
        if (!next) onTry?.(null);
    }

    function item(pair: { key: string; name: string }) {
        const trying = highlight === pair.key && pair.key !== current.key;
        return (
            <CommandItem
                key={pair.key}
                value={pair.key}
                keywords={[pair.name]}
                data-typeface={pair.key}
                onSelect={() => {
                    if (onChoose(pair.key)) setOpenAndTry(false);
                }}
                style={{ fontFamily: face(pair.key) }}
                className={cn(
                    "mx-1 gap-2.5 rounded-[7px] px-3 text-base",
                    inSheet ? "min-h-[52px]" : "min-h-[38px]",
                )}
            >
                <Check
                    aria-hidden
                    className={cn(
                        "size-4 shrink-0",
                        pair.key === current.key ? "opacity-100" : "opacity-0",
                    )}
                />
                <span className="min-w-0 flex-1 truncate">{pair.name}</span>
                {trying || note(pair.key) ? (
                    <small className="ml-auto shrink-0 font-sans text-xs text-muted-foreground">
                        {trying && !inSheet
                            ? "Trying on the page"
                            : note(pair.key)}
                    </small>
                ) : null}
            </CommandItem>
        );
    }

    const picker = (
        <BrandPicker
            open={open}
            onOpenChange={setOpenAndTry}
            title="Fonts"
            className="w-[360px] max-w-[calc(100vw-24px)]"
            header={
                <div className="shrink-0 border-b px-3.5 py-2.5">
                    <b className="block text-sm font-semibold">Fonts</b>
                    <span className="text-xs text-muted-foreground">
                        Heading and body, chosen together
                    </span>
                </div>
            }
            trigger={
                <Button
                    data-ph-unmask=""
                    type="button"
                    variant="outline"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    data-typeface-change=""
                    aria-label={`Change fonts, now ${current.name}`}
                    className={cn(
                        "h-auto min-h-11 w-full justify-start gap-2 rounded-[10px] bg-card px-3 py-2 text-left font-normal",
                        open && "border-foreground ring-1 ring-foreground",
                    )}
                >
                    <span className="min-w-0 flex-1">
                        <span
                            className="block truncate text-base leading-tight"
                            style={{ fontFamily: face(current.key) }}
                        >
                            {current.name}
                        </span>
                        {rowNote ? (
                            <span className="block text-xs text-muted-foreground">
                                {rowNote}
                            </span>
                        ) : null}
                    </span>
                    <ChevronDown
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                </Button>
            }
        >
            <Command
                value={highlight}
                onValueChange={(key) => {
                    setHighlight(key);
                    // The face under the highlight, on the page, unsaved.
                    // Not on a phone: there a tap is the choice itself.
                    if (!inSheet) onTry?.(key === current.key ? null : key);
                }}
                className="min-h-0 flex-1 rounded-none bg-transparent"
            >
                {/* Nine faces fit a sheet: no search on a phone. */}
                {inSheet ? null : (
                    <div className="relative">
                        <CommandInput
                            value={search}
                            onValueChange={setSearch}
                            placeholder="Search fonts"
                            aria-label="Search fonts"
                            className="pr-10 text-sm"
                        />
                        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border px-1 font-mono text-[0.65625rem] text-muted-foreground">
                            Esc
                        </kbd>
                    </div>
                )}
                <CommandList className="max-h-none min-h-0 flex-1 pb-1.5">
                    <CommandEmpty>{noMatchLine("fonts", search)}</CommandEmpty>
                    {free.length > 0 ? (
                        <CommandGroup heading="On your plan">
                            {free.map(item)}
                        </CommandGroup>
                    ) : null}
                    {paid.length > 0 ? (
                        <CommandGroup
                            heading={
                                <Badge variant="tag" size="sm">
                                    Paid plans
                                </Badge>
                            }
                        >
                            {paid.map(item)}
                        </CommandGroup>
                    ) : null}
                </CommandList>
            </Command>
            {refused ? (
                <PickerFoot>
                    <PaidRefusal name={refused} />
                </PickerFoot>
            ) : inSheet ? null : (
                <PickerFoot>
                    <p>
                        <Kbd>↑</Kbd> <Kbd>↓</Kbd> tries a pair on the page ·{" "}
                        <Kbd>Enter</Kbd> keeps it · <Kbd>Esc</Kbd> puts back
                    </p>
                </PickerFoot>
            )}
        </BrandPicker>
    );

    return (
        <section className="space-y-2">
            {/* On a phone (DEC-185) the Type tab is the faces themselves. */}
            {inSheet ? (
                <div data-typeface-current={current.key}>{picker}</div>
            ) : (
                <>
                    <h3 className="text-sm font-semibold">Fonts</h3>
                    <div data-typeface-current={current.key}>{picker}</div>
                </>
            )}
            {refused && !open && !inSheet ? (
                <PaidRefusal name={refused} />
            ) : null}
        </section>
    );
}

function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="rounded border bg-background px-1 font-mono text-[0.65625rem]">
            {children}
        </kbd>
    );
}
