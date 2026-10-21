"use client";

import { cn } from "../lib/utils";
import { LOOK_EASE, LOOK_RING } from "../look-header-parts";

/**
 * The − 1 + stepper under a look (DEC-172, plan U11, #1102). It has ONE
 * meaning everywhere it is drawn — the grid's card, the product page and
 * the bag's lines: the number is what is in the bag now. + adds one to the
 * bag and − takes one out. Each button is 44×44 under any pointer, and the
 * stepper is an outline: the view's filled button is somewhere else.
 *
 * `min` is where − stops: 0 on the grid and the product page (the last one
 * out turns the stepper back into Add to bag), 1 in the bag, whose lines
 * leave by Remove, never by a slip of the thumb.
 */
export function BagStepper({
    name,
    quantity,
    onChange,
    min = 0,
    canAdd = true,
    className,
}: {
    /** What it counts, for the buttons' names: "Country sourdough". */
    name: string;
    quantity: number;
    onChange: (next: number) => void;
    min?: number;
    /** False: nothing more can go in (sold out, all of it in the bag). */
    canAdd?: boolean;
    className?: string;
}) {
    const button = cn(
        "text-site-fg flex size-11 shrink-0 cursor-pointer items-center justify-center text-lg leading-none hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,transparent)] disabled:cursor-not-allowed disabled:opacity-40",
        LOOK_RING,
        LOOK_EASE,
    );
    return (
        <span
            data-bag-stepper=""
            className={cn(
                "rounded-site border-site-rule inline-flex h-11 shrink-0 items-center overflow-hidden border",
                className,
            )}
        >
            <button
                type="button"
                onClick={() => onChange(quantity - 1)}
                disabled={quantity <= min}
                aria-label={
                    quantity <= 1
                        ? `Take ${name} out of your bag`
                        : `One fewer ${name}`
                }
                className={button}
            >
                <span aria-hidden="true">−</span>
            </button>
            <span
                aria-live="polite"
                className="min-w-8 text-center text-[15px] font-semibold tabular-nums"
            >
                <span aria-hidden="true">{quantity}</span>
                <span className="sr-only">{`${quantity} ${name} in your bag`}</span>
            </span>
            <button
                type="button"
                onClick={() => onChange(quantity + 1)}
                disabled={!canAdd}
                aria-label={`One more ${name}`}
                className={button}
            >
                <span aria-hidden="true">+</span>
            </button>
        </span>
    );
}
