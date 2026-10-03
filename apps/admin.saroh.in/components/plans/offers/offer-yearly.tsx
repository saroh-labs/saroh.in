"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { useId } from "react";

import { useDraft } from "../draft-store";
import { WholeField } from "./number-field";
import { YEARLY_INPUT_MAX, YEARLY_INPUT_MIN, yearlyLines } from "./offers";
import { CHECKBOX_SAFFRON, ChangedDot, OfferCard } from "./parts";

/** "Pay for [10] months, get 12", and what that makes each paid plan a year. */
export function OfferYearly() {
    const { catalog, live, edit, canEdit } = useDraft();
    const id = useId();
    if (!catalog) return null;
    const { yearly } = catalog;
    const was = live?.catalog.yearly;
    const changed = !!was && (was.on !== yearly.on || was.paid !== yearly.paid);

    return (
        <OfferCard label="Yearly billing">
            <div className="flex items-center gap-2.5 font-semibold">
                <Checkbox
                    id={`${id}-on`}
                    checked={yearly.on}
                    disabled={!canEdit}
                    className={CHECKBOX_SAFFRON}
                    onCheckedChange={(v) =>
                        edit((c) => {
                            c.yearly = { ...c.yearly, on: v === true };
                        })
                    }
                />
                <label htmlFor={`${id}-on`} className="cursor-pointer">
                    Yearly billing
                </label>
                <ChangedDot on={changed} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-foreground/80">
                Pay for
                <WholeField
                    aria-label="Months paid"
                    value={yearly.paid}
                    min={YEARLY_INPUT_MIN}
                    max={YEARLY_INPUT_MAX}
                    disabled={!canEdit}
                    className="w-14"
                    onValue={(paid) =>
                        edit((c) => {
                            c.yearly = { ...c.yearly, paid };
                        })
                    }
                />
                months, get 12
            </div>
            <div className="grid gap-1 text-[12.5px] text-muted-foreground">
                {yearlyLines(catalog).map((line) => (
                    <span key={line}>{line}</span>
                ))}
            </div>
        </OfferCard>
    );
}
