"use client";

import { PHONE_COUNTRIES } from "@saroh/block-contract";
import { addressRulesFor } from "@saroh/edition/address-rules";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";

const COUNTRY_OPTIONS = PHONE_COUNTRIES.map((c) => ({
    value: c.code,
    label: c.name,
}));

export interface PlaceDraft {
    state: string;
    postalCode: string;
    country: string;
}

/**
 * A Global delivery past the city (DEC-207): its country, then its region
 * and postcode in that country's words — a state from the list in the US,
 * Canada and Australia, typed elsewhere, no postcode where the country has
 * none. The API holds the order to the same rules (`checkDeliveryPlace`).
 * Laid out by the caller's grid; India's state and PIN fields stay its own.
 */
export function DeliveryPlaceFields({
    place,
    onChange,
    dense,
    className = "w-full",
}: {
    place: PlaceDraft;
    onChange: (next: PlaceDraft) => void;
    dense?: boolean;
    className?: string;
}) {
    const rules = addressRulesFor(place.country);
    const region = rules.region;
    return (
        <>
            <OptionSelect
                aria-label="Country"
                value={place.country}
                // A region belongs to its country.
                onValueChange={(country) =>
                    onChange({
                        ...place,
                        country,
                        state: country === place.country ? place.state : "",
                    })
                }
                options={COUNTRY_OPTIONS}
                placeholder="Country"
                size={dense ? "sm" : "default"}
                className={className}
            />
            {region.kind === "list" ? (
                <OptionSelect
                    aria-label={region.label}
                    value={place.state}
                    onValueChange={(state) => onChange({ ...place, state })}
                    options={region.options.map((o) => ({
                        value: o.code,
                        label: o.name,
                    }))}
                    placeholder={region.label}
                    size={dense ? "sm" : "default"}
                    className={className}
                />
            ) : region.kind === "text" ? (
                <Input
                    dense={dense}
                    aria-label={region.label}
                    placeholder={region.label}
                    autoComplete="address-level1"
                    value={place.state}
                    onChange={(e) =>
                        onChange({ ...place, state: e.target.value })
                    }
                    className={className}
                />
            ) : null}
            {rules.postcode ? (
                <Input
                    dense={dense}
                    aria-label={rules.postcode.label}
                    placeholder={rules.postcode.example || rules.postcode.label}
                    autoComplete="postal-code"
                    value={place.postalCode}
                    onChange={(e) =>
                        onChange({ ...place, postalCode: e.target.value })
                    }
                    className={className}
                />
            ) : null}
        </>
    );
}
