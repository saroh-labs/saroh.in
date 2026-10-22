"use client";

import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";

import { CountrySelect } from "@/components/organizations/business-details/country-select";
import { Chip } from "@/components/shared/lists/chip";
import { cleanAddressInput } from "@/lib/organizations/address";
import { kindDefaults, kindWords } from "@/lib/organizations/kind";
import type { SetupValues } from "@/lib/organizations/setup-steps";

import { SetupManagerCode } from "./setup-manager-code";
import type { AddressState } from "./use-address-check";

/**
 * The countries a merchant is most likely to be in, offered as chips, as the
 * design draws them. Any other is one tap further, through the full list:
 * the chips are a shortcut, never the limit of what can be chosen.
 */
const COMMON_COUNTRIES = [
    { code: "IN", name: "India" },
    { code: "AE", name: "UAE" },
    { code: "SG", name: "Singapore" },
    { code: "GB", name: "United Kingdom" },
    { code: "US", name: "United States" },
] as const;

/**
 * Setup's second step: your name if the account has none, what it is
 * called, its web address and where it is.
 *
 * The web address follows the name until the merchant edits it, and is
 * checked as they go. It is the one thing here that is hard to change later,
 * because it is where the business's website lives (`<address>.saroh.app`),
 * so it is asked once, here, and never again when Website is turned on.
 *
 * The country stays on this step, under the address: it is one tap, India
 * is chosen, and it is rarely changed. Under it, one quiet line asks
 * whether someone from Saroh is helping, for their code (DEC-169).
 *
 * It draws inside the setup form's `<Form>`: the answers are that one
 * form's, so leaving this step and coming back loses nothing.
 */
export function SetupNameStep({
    needsName,
    availability,
    taken,
    edited,
    onEdited,
    otherCountry,
    onOtherCountry,
}: {
    /** The account has no name yet, so setup asks for it. */
    needsName: boolean;
    availability: AddressState;
    taken: boolean;
    /** The web address was typed by hand. */
    edited: boolean;
    onEdited: () => void;
    otherCountry: boolean;
    onOtherCountry: (open: boolean) => void;
}) {
    const form = useFormContext<SetupValues>();
    const kind = useWatch({ control: form.control, name: "kind" });
    const country = useWatch({ control: form.control, name: "country" });
    const words = kindWords(kind);
    const defaults = kindDefaults(kind);

    return (
        <>
            {needsName ? (
                <FormField
                    control={form.control}
                    name="yourName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Your name</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="name"
                                    className="coarse:text-base"
                                    {...field}
                                    value={field.value ?? ""}
                                />
                            </FormControl>
                            <FormDescription>
                                What your team sees when you invite them.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : null}

            <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel data-ph-unmask="">
                            {words.nameLabel}
                        </FormLabel>
                        <FormControl>
                            <Input
                                placeholder={defaults.namePlaceholder}
                                autoComplete="organization"
                                className="coarse:text-base"
                                {...field}
                            />
                        </FormControl>
                        <FormDescription>
                            People see this on your site and invoices. You can
                            change it later.
                        </FormDescription>
                        {/* The API's sentence can repeat what was typed. */}
                        <FormMessage data-ph-mask="" />
                    </FormItem>
                )}
            />

            <FormField
                control={form.control}
                name="address"
                render={({ field, fieldState }) => (
                    <FormItem>
                        <FormLabel>Web address</FormLabel>
                        {/* FormControl on the Input itself, so the label,
                            the description and any error are wired to the
                            field a screen reader lands on, not its frame. */}
                        <div
                            className={cn(
                                "flex h-[38px] items-center rounded-md border border-input bg-field pr-3 font-mono text-sm focus-within:ring-2 focus-within:ring-ring coarse:h-11",
                                (taken || fieldState.invalid) &&
                                    "border-destructive",
                            )}
                        >
                            <FormControl>
                                <Input
                                    {...field}
                                    onChange={(e) => {
                                        onEdited();
                                        field.onChange(
                                            cleanAddressInput(e.target.value),
                                        );
                                    }}
                                    spellCheck={false}
                                    autoCapitalize="off"
                                    // Taken: the field is in error, and the
                                    // line that says why is its status
                                    // line, so Continue can put the keyboard
                                    // here.
                                    {...(taken && !fieldState.invalid
                                        ? {
                                              "aria-invalid": true,
                                              "aria-describedby":
                                                  "address-status",
                                          }
                                        : {})}
                                    // The frame around it is the field;
                                    // the input itself is borderless so
                                    // the address and `.saroh.app` read
                                    // as one value.
                                    className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-0 text-right font-mono shadow-none focus-visible:ring-0 coarse:h-full coarse:text-base"
                                />
                            </FormControl>
                            <span className="text-muted-foreground">
                                .saroh.app
                            </span>
                        </div>
                        <p
                            id="address-status"
                            role="status"
                            className={cn(
                                "min-h-[1.2em] text-[12px]",
                                taken
                                    ? "text-destructive"
                                    : "text-muted-foreground",
                            )}
                        >
                            {availability === "checking" ? (
                                "Checking…"
                            ) : availability?.available ? (
                                <span className="inline-flex items-center gap-1 text-success">
                                    <Check aria-hidden className="size-3.5" />
                                    Available. Your website will live here.
                                </span>
                            ) : taken ? (
                                (availability?.reason ??
                                "That web address is taken. Try another.")
                            ) : null}
                        </p>
                        <FormDescription>
                            {edited
                                ? "Changing it later breaks saved links, so it is worth getting right now."
                                : "Follows the name until you edit it. Changing it later breaks saved links, so it is worth getting right now."}
                        </FormDescription>
                        {/* The API's sentence can repeat what was typed. */}
                        <FormMessage data-ph-mask="" />
                    </FormItem>
                )}
            />

            <FormItem>
                <FormLabel id="country-label">
                    {kind === "BUSINESS"
                        ? "Where does it trade?"
                        : "Where are you based?"}
                </FormLabel>
                <div
                    role="radiogroup"
                    aria-labelledby="country-label"
                    className="flex flex-wrap gap-1.5"
                    // The countries are Saroh's own list.
                    data-ph-unmask=""
                >
                    {COMMON_COUNTRIES.map((c) => (
                        <Chip
                            key={c.code}
                            on={!otherCountry && country === c.code}
                            onClick={() => {
                                onOtherCountry(false);
                                form.setValue("country", c.code);
                            }}
                        >
                            <span className="font-mono text-[11px] opacity-70">
                                {c.code}
                            </span>
                            {c.name}
                        </Chip>
                    ))}
                    <Chip
                        on={otherCountry}
                        onClick={() => onOtherCountry(true)}
                    >
                        Another country
                    </Chip>
                </div>
                {otherCountry ? (
                    <CountrySelect
                        value={country}
                        onValueChange={(code) => form.setValue("country", code)}
                        aria-describedby="country-note"
                    />
                ) : null}
                <FormDescription id="country-note">
                    {kind === "BUSINESS"
                        ? "Where the business is based."
                        : "Where you work from."}{" "}
                    You can change it in Settings.
                </FormDescription>
            </FormItem>

            <SetupManagerCode />
        </>
    );
}
