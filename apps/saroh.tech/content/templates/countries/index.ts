import type { CountryEntry } from "../types";

import { australia } from "./australia";
import { canada } from "./canada";
import { singapore } from "./singapore";
import { uae } from "./uae";
import { uk } from "./uk";
import { us } from "./us";

/** All 6 countries. Add `data` when a country's file is written (see README.md). */
export const COUNTRIES: CountryEntry[] = [
    { slug: "uk", name: "UK", place: "the UK", tax: "VAT", data: uk },
    { slug: "us", name: "US", place: "the US", tax: "sales tax", data: us },
    {
        slug: "canada",
        name: "Canada",
        place: "Canada",
        tax: "GST/HST",
        data: canada,
    },
    {
        slug: "australia",
        name: "Australia",
        place: "Australia",
        tax: "GST",
        data: australia,
    },
    { slug: "uae", name: "UAE", place: "the UAE", tax: "VAT", data: uae },
    {
        slug: "singapore",
        name: "Singapore",
        place: "Singapore",
        tax: "GST",
        data: singapore,
    },
];
