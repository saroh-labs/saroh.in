"use client";

import type { LucideProps } from "lucide-react";
import { Banknote, IndianRupee } from "lucide-react";

import { useStartingCurrency } from "@/components/shared/fields/business-country";

/**
 * The icon for money: a rupee for rupees, as India has always seen it, and a
 * plain note for any other currency. `currency` names the amount's own, when it
 * has one; otherwise it is the business's.
 */
export function MoneyIcon({
    currency,
    ...props
}: LucideProps & { currency?: string | null }) {
    const business = useStartingCurrency();
    const Icon = (currency ?? business) === "INR" ? IndianRupee : Banknote;
    return <Icon {...props} />;
}
