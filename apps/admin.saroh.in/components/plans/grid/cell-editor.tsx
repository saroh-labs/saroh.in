"use client";

import type { Cell } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { cn } from "@saroh/ui/lib/utils";
import { Minus, Plus } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { FIELD, SMALL_FIELD } from "../plans/fields";

/**
 * One cell of the Plans grid, open (admin redesign U11, R20). A switch row
 * is Included or Not included: picking one is the change. A limit row adds
 * −/+, the number and No limit, with who it reaches at renewal, and Done
 * or Cancel. Enter in the number is Done; Esc anywhere in the editor is
 * Cancel. These controls exist only while the cell is open, so they are
 * never in the grid's tab order otherwise.
 *
 * It holds what is being typed and says what it wants on commit; the grid
 * turns that into one `edit()` of the draft.
 */

export type CellChoice = { inc: false } | { inc: true; limit?: number | null };

/** A cap as typed: a whole number above 0, else refused. */
function readLimit(text: string): number | undefined {
    const t = text.trim();
    if (!/^\d{1,9}$/.test(t)) return undefined;
    const n = Number(t);
    return n > 0 ? n : undefined;
}

const CHOICE =
    "h-8 rounded-[8px] border px-3 text-[12.5px] font-semibold aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background";

export function CellEditor({
    label,
    cell,
    limitRow,
    reach,
    usage,
    onCommit,
    onCancel,
}: {
    /** "Things on Plan B", for the controls' names. */
    label: string;
    cell: Cell;
    limitRow: boolean;
    /** "Reaches 2 businesses at renewal". */
    reach: string;
    /** The usage line for a limit, recounted as it's typed. */
    usage: (limit: number | null) => string | null;
    onCommit: (choice: CellChoice) => void;
    onCancel: () => void;
}) {
    const id = useId();
    const [inc, setInc] = useState(cell.inc);
    const startLimit = cell.inc ? cell.limit : null;
    const [noLimit, setNoLimit] = useState(cell.inc && startLimit == null);
    const [text, setText] = useState(
        startLimit == null ? "" : String(startLimit),
    );
    const [tried, setTried] = useState(false);
    const first = useRef<HTMLElement | null>(null);

    useEffect(() => {
        first.current?.focus();
        if (first.current instanceof HTMLInputElement) first.current.select();
    }, []);

    const typed = readLimit(text);
    const limit = noLimit ? null : typed;
    const refused = inc && !noLimit && typed === undefined;

    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
        }
    };

    const done = () => {
        if (!limitRow) return;
        if (!inc) return onCommit({ inc: false });
        if (refused) {
            setTried(true);
            return;
        }
        onCommit({ inc: true, limit });
    };

    const step = (by: 1 | -1) => {
        const n = (typed ?? 0) + by;
        setText(String(Math.max(1, n)));
    };

    if (!limitRow) {
        return (
            <div
                role="group"
                aria-label={`Change ${label}`}
                onKeyDown={onKeyDown}
                className="flex flex-wrap gap-1"
            >
                {[true, false].map((on) => (
                    <Button
                        key={String(on)}
                        ref={(el) => {
                            if (on === cell.inc) first.current = el;
                        }}
                        type="button"
                        variant="outline"
                        aria-pressed={cell.inc === on}
                        className={CHOICE}
                        onClick={() =>
                            onCommit(on ? { inc: true } : { inc: false })
                        }
                    >
                        {on ? "Included" : "Not included"}
                    </Button>
                ))}
            </div>
        );
    }

    const note = refused && tried ? "A whole number above 0" : null;
    const line = inc ? usage(limit ?? null) : null;

    return (
        <div
            role="group"
            aria-label={`Change ${label}`}
            onKeyDown={onKeyDown}
            className="grid min-w-[208px] gap-2 text-left font-normal"
        >
            <div className="flex gap-1">
                {[true, false].map((on) => (
                    <Button
                        key={String(on)}
                        ref={(el) => {
                            if (!cell.inc && !on) first.current = el;
                        }}
                        type="button"
                        variant="outline"
                        aria-pressed={inc === on}
                        className={CHOICE}
                        onClick={() => setInc(on)}
                    >
                        {on ? "Included" : "Not included"}
                    </Button>
                ))}
            </div>
            {inc && (
                <>
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`One less for ${label}`}
                            disabled={noLimit}
                            className="size-8 shrink-0 rounded-[8px]"
                            onClick={() => step(-1)}
                        >
                            <Minus aria-hidden className="size-3.5" />
                        </Button>
                        <input
                            ref={(el) => {
                                if (cell.inc) first.current = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            aria-label={`Limit for ${label}`}
                            aria-invalid={!!note}
                            aria-describedby={note ? `${id}-note` : undefined}
                            value={noLimit ? "" : text}
                            placeholder={noLimit ? "No limit" : undefined}
                            disabled={noLimit}
                            onChange={(e) => {
                                setText(e.target.value);
                                setTried(false);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    done();
                                }
                            }}
                            className={cn(
                                FIELD,
                                SMALL_FIELD,
                                "w-20 text-right",
                            )}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`One more for ${label}`}
                            disabled={noLimit}
                            className="size-8 shrink-0 rounded-[8px]"
                            onClick={() => step(1)}
                        >
                            <Plus aria-hidden className="size-3.5" />
                        </Button>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                        <Checkbox
                            checked={noLimit}
                            onCheckedChange={(v) => {
                                setNoLimit(v === true);
                                setTried(false);
                            }}
                        />
                        No limit
                    </label>
                    {note && (
                        <p
                            id={`${id}-note`}
                            className="text-[12px] text-destructive"
                        >
                            {note}
                        </p>
                    )}
                </>
            )}
            <p className="text-[12px] leading-[1.45] text-muted-foreground">
                {reach}
                {line ? ` · ${line}` : ""}
            </p>
            <div className="flex gap-1.5">
                <Button
                    type="button"
                    className="h-8 rounded-[8px] px-3 text-[12.5px]"
                    onClick={done}
                >
                    Done
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className="h-8 rounded-[8px] px-3 text-[12.5px]"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}
