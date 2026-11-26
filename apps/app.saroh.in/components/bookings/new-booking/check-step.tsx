"use client";

import { Button } from "@saroh/ui/button";
import { ChipGroup } from "@saroh/ui/choice-group";
import { Notice } from "@saroh/ui/notice";
import { OptionSelect } from "@saroh/ui/option-select";
import type { ComponentProps } from "react";
import { useId } from "react";

import { PayChoice } from "@/components/bookings/sheets/pay-choice";
import { Refusal } from "@/components/shared/states/refusal";

import type { CheckRow } from "./steps";
import { CheckCard } from "./steps";

/**
 * Step 5, Check and book (BKMNewBookingStep5, BKDNewBooking): the check
 * card with Change on each line, the customer's Needs attention, how they
 * will pay (a class pack first when they hold one, and which, when more
 * than one), and why Book was refused, where the choice is.
 */
export function CheckStep({
    rows,
    attention,
    pay,
    packs,
    packRefusal,
    packsFailed = null,
    refusal,
    where = null,
    free = false,
}: {
    /** A free service (DEC-261): nothing to pay, so no way to pay is asked. */
    free?: boolean;
    /**
     * Where (DEC-233, board GC2NewBooking): the service's own way, or a
     * Google Meet of this booking's own. Null while Google isn't on here.
     */
    where?: {
        meet: boolean;
        onChange: (meet: boolean) => void;
        serviceLabel: string;
        note: string;
    } | null;
    rows: readonly CheckRow[];
    /** "Allergy: Latex · Medical: …"; null for nothing to say. */
    attention: string | null;
    pay: ComponentProps<typeof PayChoice>;
    /** The packs that can pay, to pick from when more than one. */
    packs: {
        value: string;
        options: { value: string; label: string }[];
        onChange: (id: string) => void;
    } | null;
    packRefusal: string | null;
    /** Their class packs couldn't be read: said, with Try again. */
    packsFailed?: { first: string; onRetry: () => void } | null;
    refusal: string | null;
}) {
    return (
        <div className="grid min-w-0 gap-3">
            <CheckCard rows={rows} />
            {where ? <WhereChoice {...where} /> : null}
            {attention ? (
                <Notice tone="error" role="note">
                    Needs attention: {attention}
                </Notice>
            ) : null}
            {free ? (
                <p
                    data-ph-unmask=""
                    className="m-0 mt-1 text-sm text-muted-foreground"
                >
                    It&apos;s free, so there&apos;s nothing to pay.
                </p>
            ) : (
                <PayChoice className="mt-1" {...pay} />
            )}
            {packs && packs.options.length > 1 ? (
                <OptionSelect
                    aria-label="Which pack"
                    value={packs.value}
                    onValueChange={packs.onChange}
                    options={packs.options}
                />
            ) : null}
            {packsFailed ? (
                <Notice
                    tone="warning"
                    align="center"
                    action={
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={packsFailed.onRetry}
                        >
                            Try again
                        </Button>
                    }
                >
                    Couldn&apos;t check{" "}
                    {packsFailed.first ? `${packsFailed.first}'s` : "their"}{" "}
                    class packs. If they hold one, try again before you book.
                </Notice>
            ) : null}
            {packRefusal ? <Notice tone="error">{packRefusal}</Notice> : null}
            <Refusal>{refusal}</Refusal>
        </div>
    );
}

function WhereChoice({
    meet,
    onChange,
    serviceLabel,
    note,
}: {
    meet: boolean;
    onChange: (meet: boolean) => void;
    serviceLabel: string;
    note: string;
}) {
    const id = useId();
    return (
        <div className="mt-1 grid gap-2">
            <p
                id={id}
                data-ph-unmask=""
                className="m-0 text-[13.5px] font-semibold"
            >
                Where
            </p>
            <ChipGroup
                labelledBy={id}
                value={meet ? "meet" : "service"}
                onChange={(v) => onChange(v === "meet")}
                choices={[
                    { value: "service", label: serviceLabel },
                    { value: "meet", label: "Google Meet" },
                ]}
            />
            {meet ? (
                <p className="m-0 text-[12.5px] text-muted-foreground">
                    {note}
                </p>
            ) : null}
        </div>
    );
}
