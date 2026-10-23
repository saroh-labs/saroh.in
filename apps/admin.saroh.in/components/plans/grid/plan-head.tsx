"use client";

import type { Plan } from "@saroh/pricing-catalog";
import { cn } from "@saroh/ui/lib/utils";
import { Pencil } from "lucide-react";
import { useId, useRef, useState } from "react";

import { PRICE_HINT, parseRupees, rupeesText } from "../plans/catalog-edits";
import type { GridKeys, GridPos } from "./use-grid-keys";

/**
 * A plan's column header in the Plans grid (admin redesign U11, R20): its
 * name, its price box (₹ … /month, before GST) and a pencil to the plan's
 * own settings (the plan sheet, U12). The header is a cell of the grid's
 * keyboard: Enter puts the keyboard in the price box, where Enter keeps the
 * price and Esc puts it back, and Tab goes on to the pencil (Esc there is
 * back on the header). Out of the header, the pencil leaves the tab order
 * again, so Tab still leaves the grid in one stop. A price that isn't rupees ("-5", "12a") is refused beside the box
 * and never reaches the draft.
 */
export function PlanHead({
    pos,
    keys,
    plan,
    was,
    canEdit,
    onPrice,
    onSettings,
    priceRef,
}: {
    pos: GridPos;
    keys: GridKeys;
    plan: Plan;
    /** "was ₹111" when the draft changed the price. */
    was: string | null;
    canEdit: boolean;
    onPrice: (paise: number) => void;
    /** The pencil: the plan's name, button, wording, highlight and retire. */
    onSettings: () => void;
    priceRef: (el: HTMLInputElement | null) => void;
}) {
    const id = useId();
    const name = plan.name || "Unnamed plan";
    const [text, setText] = useState(() => rupeesText(plan.pricePaise));
    const [shown, setShown] = useState(plan.pricePaise);
    // The draft moved under the box (a reload, a discard): show it.
    if (shown !== plan.pricePaise) {
        setShown(plan.pricePaise);
        setText(rupeesText(plan.pricePaise));
    }
    const refused = parseRupees(text) === null;
    const cellRef = useRef<HTMLElement | null>(null);
    const cell = keys.cellProps(pos);
    /** The keyboard is inside the header (its price box or pencil). */
    const [inside, setInside] = useState(false);

    /** Enter or Esc has dealt with the box: the blur that follows hasn't. */
    const settled = useRef(false);
    const back = () => {
        settled.current = true;
        cellRef.current?.focus();
        settled.current = false;
    };
    const keep = () => {
        const paise = parseRupees(text);
        if (paise === null) return false;
        if (paise !== plan.pricePaise) onPrice(paise);
        return true;
    };

    return (
        <th
            role="columnheader"
            scope="col"
            {...cell}
            ref={(el) => {
                cellRef.current = el;
                cell.ref(el);
            }}
            data-plan={plan.id}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget))
                    setInside(false);
            }}
            className={cn(
                "min-w-[132px] border-b border-border px-2 pb-2.5 pt-1 text-left align-top font-normal outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                plan.featured && "bg-highlight-subtle/40",
                plan.retired && "opacity-60",
            )}
        >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1">
                <span className="col-start-1 row-start-1 min-w-0 truncate text-[13.5px] font-semibold">
                    {name}
                    {plan.retired && (
                        <span
                            className="font-normal text-muted-foreground"
                            title="Retired: not on the pricing page"
                        >
                            {" "}
                            (retired)
                            <span className="sr-only">
                                : not on the pricing page
                            </span>
                        </span>
                    )}
                </span>
                <div className="col-span-2 mt-1 flex items-center gap-1 text-[12.5px] text-muted-foreground">
                    <span aria-hidden>₹</span>
                    <input
                        ref={priceRef}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        tabIndex={-1}
                        readOnly={!canEdit}
                        aria-label={`${name}'s price a month, before GST, in rupees`}
                        aria-invalid={refused}
                        aria-describedby={refused ? `${id}-hint` : undefined}
                        value={text}
                        onFocus={() => setInside(true)}
                        onChange={(e) => setText(e.target.value)}
                        onBlur={() => {
                            if (settled.current || !keep()) return;
                            setText(
                                rupeesText(
                                    parseRupees(text) ?? plan.pricePaise,
                                ),
                            );
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                if (keep()) back();
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                setText(rupeesText(plan.pricePaise));
                                back();
                            }
                        }}
                        className="h-7 w-[72px] min-w-0 rounded-[7px] border border-border-strong bg-field px-1.5 text-right text-[13px] font-semibold tabular-nums text-foreground read-only:cursor-default read-only:border-transparent read-only:bg-transparent focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
                    />
                    <span>/month</span>
                </div>
                {refused && (
                    <p
                        id={`${id}-hint`}
                        className="col-span-2 mt-1 text-[11.5px] leading-snug text-destructive"
                    >
                        {PRICE_HINT}
                    </p>
                )}
                {was && !refused && (
                    <p className="col-span-2 mt-1 text-[11px] font-medium text-warning">
                        {was}
                    </p>
                )}
                <button
                    type="button"
                    tabIndex={inside ? 0 : -1}
                    aria-label={`${name}'s settings`}
                    onClick={onSettings}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            e.preventDefault();
                            back();
                        }
                    }}
                    className="col-start-2 row-start-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active"
                >
                    <Pencil aria-hidden className="size-3.5" />
                </button>
            </div>
        </th>
    );
}
