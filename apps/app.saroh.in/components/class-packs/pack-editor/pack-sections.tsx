"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { useId } from "react";

import type {
    PackKind,
    PackServiceOption,
    PackValues,
} from "@/lib/class-packs/pack-editor";
import {
    KIND_OPTIONS,
    kindNote,
    MAX_DESCRIPTION,
    parseWhole,
    switchKind,
    unitsOf,
} from "@/lib/class-packs/pack-editor";
import {
    eachNote,
    glance,
    packRules,
} from "@/lib/class-packs/pack-editor-words";
import { currencySymbol } from "@/lib/format/money";

import { FIELD, FieldError, HELP, LABEL, PackChip, PackSection } from "./parts";
import { ValidityChips } from "./validity-chips";

/*
 * The Pack Editor's sections (E18), in the design's order: Details and
 * Credits and price in the main column (Good for is `services-picker.tsx`),
 * Who can buy it, At a glance and the rules note in the side one. Each
 * edits the values through `set`; problems arrive in `errors` by field.
 */

interface Edit {
    values: PackValues;
    set: (patch: Partial<PackValues>) => void;
    errors: Partial<Record<string, string>>;
}

/** Name, a description, and what the credits are for (locked once sold). */
export function Details({
    values,
    set,
    errors,
    services,
    locked,
    live,
    sold,
}: Edit & {
    services: PackServiceOption[] | null;
    /** A sold pack's kind can't change (E13). */
    locked: boolean;
    live: boolean;
    sold: number | null;
}) {
    const ids = {
        name: useId(),
        nameErr: useId(),
        desc: useId(),
        descErr: useId(),
        kind: useId(),
        kindNote: useId(),
        kindErr: useId(),
    };
    const pick = (kind: PackKind) => {
        if (locked || kind === values.kind) return;
        // Credits never mix: switching the kind swaps what it is good for.
        // Unread services leave the choice as it is.
        set(services ? switchKind(kind, services) : { kind });
    };
    return (
        <PackSection title="Details">
            <label htmlFor={ids.name} className={LABEL}>
                Name
            </label>
            <Input
                id={ids.name}
                value={values.name}
                maxLength={120}
                autoComplete="off"
                placeholder="e.g. 10 classes"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? ids.nameErr : undefined}
                onChange={(e) => set({ name: e.target.value })}
                className={FIELD}
            />
            <FieldError id={ids.nameErr} message={errors.name} />

            <label htmlFor={ids.desc} className={cn(LABEL, "mt-3")}>
                Description{" "}
                <span className="font-normal text-muted-foreground">
                    (optional)
                </span>
            </label>
            <Textarea
                id={ids.desc}
                rows={2}
                maxLength={MAX_DESCRIPTION}
                value={values.description ?? ""}
                placeholder="e.g. Any class, any day. Great for getting started."
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={errors.description ? ids.descErr : undefined}
                onChange={(e) => set({ description: e.target.value })}
                className="mt-[5px] rounded-[8px] text-[14px]"
            />
            <FieldError id={ids.descErr} message={errors.description} />

            <div id={ids.kind} className={cn(LABEL, "mt-3")}>
                Credits are for
            </div>
            <div
                role="radiogroup"
                aria-labelledby={ids.kind}
                aria-describedby={
                    errors.kind
                        ? `${ids.kindNote} ${ids.kindErr}`
                        : ids.kindNote
                }
                className="mt-1.5 flex flex-wrap gap-1.5"
            >
                {KIND_OPTIONS.map((o) => {
                    const on = values.kind === o.value;
                    return (
                        <PackChip
                            key={o.value}
                            on={on}
                            // The kind it was sold as stays pressable-looking
                            // but inert; the other one is off, with the reason
                            // said under them.
                            disabled={locked && !on}
                            aria-disabled={locked ? true : undefined}
                            onClick={() => pick(o.value)}
                        >
                            {o.label}
                        </PackChip>
                    );
                })}
            </div>
            <p id={ids.kindNote} className={HELP}>
                {kindNote(live, sold)}
            </p>
            <FieldError id={ids.kindErr} message={errors.kind} />
        </PackSection>
    );
}

/** How many, the price, what each works out at, and how long to use it. */
export function CreditsAndPrice({
    values,
    set,
    errors,
    services,
}: Edit & { services: PackServiceOption[] | null }) {
    const ids = {
        credits: useId(),
        creditsErr: useId(),
        price: useId(),
        priceErr: useId(),
    };
    const note = eachNote(values, services ?? []);
    return (
        <PackSection title="Credits and price">
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0">
                    <label htmlFor={ids.credits} className={LABEL}>
                        How many
                    </label>
                    <Input
                        id={ids.credits}
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`How many ${unitsOf(values.kind)}`}
                        value={
                            values.credits === null
                                ? ""
                                : String(values.credits)
                        }
                        aria-invalid={errors.credits ? true : undefined}
                        aria-describedby={
                            errors.credits ? ids.creditsErr : undefined
                        }
                        onChange={(e) =>
                            set({ credits: parseWhole(e.target.value) })
                        }
                        className={cn(FIELD, "w-[88px] max-w-full")}
                    />
                </div>
                <div className="min-w-0">
                    <label htmlFor={ids.price} className={LABEL}>
                        Price ({currencySymbol(values.currency)})
                    </label>
                    <Input
                        id={ids.price}
                        inputMode="decimal"
                        autoComplete="off"
                        value={values.price ?? ""}
                        aria-invalid={errors.price ? true : undefined}
                        aria-describedby={
                            errors.price ? ids.priceErr : undefined
                        }
                        onChange={(e) => {
                            const typed = e.target.value.replace(
                                /[^0-9.,]/g,
                                "",
                            );
                            set({ price: typed || null });
                        }}
                        className={cn(FIELD, "w-[140px] max-w-full")}
                    />
                </div>
            </div>
            <FieldError id={ids.creditsErr} message={errors.credits} />
            <FieldError id={ids.priceErr} message={errors.price} />
            {note ? <p className={HELP}>{note}</p> : null}
            <ValidityChips
                value={values.validityDays}
                onChange={(validityDays) => set({ validityDays })}
                error={errors.validityDays}
            />
        </PackSection>
    );
}

/** "Only for someone's first pack" (E13's first-pack rule). */
export function WhoCanBuy({ values, set, errors }: Edit) {
    const errId = useId();
    const units = values.kind === "ONE_TO_ONE" ? "one-to-one" : "class";
    return (
        <PackSection title="Who can buy it" tight>
            <label className="mt-1 flex cursor-pointer items-start gap-[9px] text-[13px]">
                <Checkbox
                    checked={values.firstPackOnly}
                    onCheckedChange={(on) =>
                        set({ firstPackOnly: on === true })
                    }
                    aria-describedby={errors.firstPackOnly ? errId : undefined}
                    className="mt-0.5"
                />
                <span>
                    Only for someone&apos;s first pack
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        An intro offer — only someone who has never bought a{" "}
                        {units} pack before can buy it.
                    </span>
                </span>
            </label>
            <FieldError id={errId} message={errors.firstPackOnly} />
        </PackSection>
    );
}

/** At a glance: per class, the saving against drop-in, and sold so far. */
export function PackGlance({
    values,
    services,
    sold,
}: {
    values: PackValues;
    services: PackServiceOption[] | null;
    sold: number | null;
}) {
    return (
        <>
            <PackSection title="At a glance" tight>
                <dl className="m-0">
                    {glance(values, services ?? [], sold).map(([k, v]) => (
                        <div
                            key={k}
                            className="flex gap-2.5 border-t border-border/60 py-[7px] text-[13px]"
                        >
                            <dt className="flex-1 text-muted-foreground">
                                {k}
                            </dt>
                            <dd className="m-0 text-right font-semibold tabular-nums">
                                {v}
                            </dd>
                        </div>
                    ))}
                </dl>
            </PackSection>
            <p className="m-0 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                {packRules(values.kind)}
            </p>
        </>
    );
}
