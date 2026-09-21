"use client";

import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

/** ISO 3166-1 alpha-2 — what the API stores and validates. */
const CODES =
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
        " ",
    );

/**
 * Names in a pinned locale: rendered on the server and again in the browser,
 * an inherited locale could name them differently and fail hydration.
 */
const NAMES = new Intl.DisplayNames(["en"], { type: "region" });

const COUNTRIES = CODES.map((code) => ({
    code,
    name: NAMES.of(code) ?? code,
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

const nameOf = (code: string) =>
    COUNTRIES.find((c) => c.code === code)?.name ?? code;

/**
 * A country, searched rather than scrolled: 249 of them is a list nobody
 * reads, so the shadcn combobox (Popover + Command) filters as you type.
 * The value is the two-letter code the API validates.
 */
export function CountrySelect({
    value,
    onValueChange,
    id,
    disabled,
    className,
    ...aria
}: {
    value: string;
    onValueChange: (code: string) => void;
    id?: string;
    disabled?: boolean;
    className?: string;
    "aria-describedby"?: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-describedby={aria["aria-describedby"]}
                    disabled={disabled}
                    className={cn(
                        // `flex`, not the button's inline-flex: in a form row it sits
                        // under its label like every other field.
                        "flex w-full max-w-[380px] justify-between bg-field font-normal",
                        !value && "text-muted-foreground",
                        className,
                    )}
                >
                    {value ? nameOf(value) : "Choose a country"}
                    <ChevronsUpDown
                        aria-hidden
                        className="size-4 shrink-0 opacity-50"
                    />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
            >
                <Command>
                    <CommandInput placeholder="Search countries" />
                    <CommandList>
                        <CommandEmpty>No country by that name.</CommandEmpty>
                        {COUNTRIES.map((c) => (
                            <CommandItem
                                key={c.code}
                                value={`${c.name} ${c.code}`}
                                onSelect={() => {
                                    onValueChange(c.code);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    aria-hidden
                                    className={cn(
                                        "mr-2 size-4",
                                        value === c.code
                                            ? "opacity-100"
                                            : "opacity-0",
                                    )}
                                />
                                {c.name}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
