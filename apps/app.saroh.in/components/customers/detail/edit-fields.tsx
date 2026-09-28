"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import type {
    DetailsDraft,
    DetailsKey,
} from "@/lib/customer-workspace/details";
import { countryOptions } from "@/lib/customer-workspace/details";
import { GST_STATES } from "@/lib/invoices/gst";

const INPUT = "h-[38px] rounded-[9px] text-[14px]";

const STATES: readonly { value: string; label: string }[] = GST_STATES;

/** One labelled field of the edit sheet, its note or its refusal below. */
export function Field({
    id,
    label,
    error,
    note,
    children,
}: {
    id: string;
    label: string;
    error?: string;
    note?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={id} className="text-[12.5px] font-medium">
                {label}
            </Label>
            {children}
            {error ? (
                <span
                    id={`${id}-note`}
                    className="text-[11.5px] text-destructive-subtle-foreground"
                >
                    {error}
                </span>
            ) : note ? (
                <span
                    id={`${id}-note`}
                    className="text-[11.5px] text-muted-foreground"
                >
                    {note}
                </span>
            ) : null}
        </div>
    );
}

/** A text input wired to one key of the draft. */
export function TextField({
    id,
    k,
    label,
    type = "text",
    maxLength,
    autoComplete,
    draft,
    set,
    error,
    note,
}: {
    id: string;
    k: DetailsKey;
    label: string;
    type?: string;
    maxLength: number;
    autoComplete?: string;
    draft: DetailsDraft;
    set: (k: DetailsKey, value: string) => void;
    error?: string;
    note?: ReactNode;
}) {
    const fid = `${id}-${k}`;
    return (
        <Field id={fid} label={label} error={error} note={note}>
            <Input
                id={fid}
                type={type}
                value={draft[k]}
                maxLength={maxLength}
                autoComplete={autoComplete}
                aria-invalid={error ? true : undefined}
                aria-describedby={error || note ? `${fid}-note` : undefined}
                onChange={(e) => set(k, e.target.value)}
                className={INPUT}
            />
        </Field>
    );
}

/**
 * The delivery address (C8): two lines, city, state, PIN and country. In
 * India the state is chosen from the GST list and the PIN is six digits;
 * elsewhere both are typed.
 */
export function AddressFields({
    id,
    draft,
    set,
    errors,
}: {
    id: string;
    draft: DetailsDraft;
    set: (k: DetailsKey, value: string) => void;
    errors: Partial<Record<DetailsKey, string>>;
}) {
    const india = draft.country === "IN";
    const common = { id, draft, set };
    return (
        <fieldset className="grid gap-3 border-t border-border pt-3.5">
            <legend className="float-left mb-0.5 w-full">
                <span className="block text-[12.5px] font-medium">
                    Delivery address
                </span>
                <span className="block text-[11.5px] text-muted-foreground">
                    Only used for deliveries.
                </span>
            </legend>
            <TextField
                {...common}
                k="addressLine1"
                label="Line 1"
                maxLength={120}
                autoComplete="off"
                error={errors.addressLine1}
            />
            <TextField
                {...common}
                k="addressLine2"
                label="Line 2"
                maxLength={120}
                autoComplete="off"
                error={errors.addressLine2}
            />
            <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                    {...common}
                    k="city"
                    label="City"
                    maxLength={60}
                    autoComplete="off"
                    error={errors.city}
                />
                <TextField
                    {...common}
                    k="postalCode"
                    label={india ? "PIN code" : "Postcode"}
                    maxLength={12}
                    autoComplete="off"
                    error={errors.postalCode}
                />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {india ? (
                    <Field
                        id={`${id}-state`}
                        label="State"
                        error={errors.state}
                    >
                        <OptionSelect
                            id={`${id}-state`}
                            value={draft.state}
                            onValueChange={(v) => set("state", v)}
                            options={STATES}
                            placeholder="Choose a state"
                            aria-invalid={errors.state ? true : undefined}
                            className={cn(INPUT, "w-full")}
                        />
                    </Field>
                ) : (
                    <TextField
                        {...common}
                        k="state"
                        label="State or region"
                        maxLength={60}
                        autoComplete="off"
                        error={errors.state}
                    />
                )}
                <Field
                    id={`${id}-country`}
                    label="Country"
                    error={errors.country}
                >
                    <OptionSelect
                        id={`${id}-country`}
                        value={draft.country}
                        onValueChange={(v) => {
                            // A state belongs to its country.
                            if (v !== draft.country) set("state", "");
                            set("country", v);
                        }}
                        options={countryOptions(draft.country)}
                        aria-invalid={errors.country ? true : undefined}
                        className={cn(INPUT, "w-full")}
                    />
                </Field>
            </div>
        </fieldset>
    );
}
