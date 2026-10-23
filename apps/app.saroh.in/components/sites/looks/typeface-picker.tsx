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
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useContext, useEffect, useRef, useState } from "react";

import type { StyleChoiceRules } from "@/lib/sites/style-access";
import { BrandPicker, PickerFoot, PickerHost } from "./brand-picker";
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
    const inSheet = useContext(PickerHost) !== null;
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
                    inSheet ? "min-h-11" : "min-h-[38px]",
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
            title="Typeface"
            className="w-[360px] max-w-[calc(100vw-24px)]"
            trigger={
                inSheet ? (
                    <button
                        type="button"
                        aria-haspopup="listbox"
                        data-typeface-change=""
                        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border bg-card px-3 text-left text-sm"
                    >
                        <span className="flex-1 text-muted-foreground">
                            Typeface
                        </span>
                        <span
                            className="truncate font-semibold"
                            style={{ fontFamily: face(current.key) }}
                        >
                            {current.name}
                        </span>
                        <ChevronRight
                            aria-hidden
                            className="size-4 shrink-0 text-muted-foreground"
                        />
                    </button>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        data-typeface-change=""
                        aria-label={`Change typeface, now ${current.name}`}
                    >
                        Change
                        <ChevronDown aria-hidden />
                    </Button>
                )
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
                <div className="relative">
                    <CommandInput
                        value={search}
                        onValueChange={setSearch}
                        placeholder="Search typefaces"
                        aria-label="Search typefaces"
                        className="text-sm"
                    />
                    {inSheet ? null : (
                        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border px-1 font-mono text-[0.65625rem] text-muted-foreground">
                            Esc
                        </kbd>
                    )}
                </div>
                <CommandList className="max-h-none min-h-0 flex-1 pb-1.5">
                    <CommandEmpty>
                        {noMatchLine("typefaces", search)}
                    </CommandEmpty>
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
                        <Kbd>↑</Kbd> <Kbd>↓</Kbd> try a face on the page ·{" "}
                        <Kbd>Enter</Kbd> keeps it · <Kbd>Esc</Kbd> puts back{" "}
                        {current.name}
                    </p>
                </PickerFoot>
            )}
        </BrandPicker>
    );

    return (
        <section className="space-y-2">
            {/* On a phone the row says "Typeface" itself. */}
            {inSheet ? (
                picker
            ) : (
                <>
                    <h3 className="label">Typeface</h3>
                    <div
                        data-typeface-current={current.key}
                        // Change drops under a long name in a narrow rail
                        // rather than cutting the name short.
                        className="flex flex-wrap items-center justify-end gap-2 rounded-[10px] border bg-card py-2 pl-2.5 pr-2"
                    >
                        <div className="min-w-[9rem] flex-1">
                            <p
                                className="text-base leading-tight"
                                style={{ fontFamily: face(current.key) }}
                            >
                                {current.name}
                            </p>
                            {note(current.key) ? (
                                <p className="text-[0.71875rem] text-muted-foreground">
                                    {note(current.key)}
                                </p>
                            ) : null}
                        </div>
                        {picker}
                    </div>
                </>
            )}
            {refused && !open ? <PaidRefusal name={refused} /> : null}
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
