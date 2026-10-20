"use client";

import Link from "next/link";

import { upgradeHref } from "@/lib/billing/access";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { paidRefusalWords } from "@/lib/sites/style-access";

/**
 * The one line a paid look, typeface or colourway gets when the plan
 * leaves it off (DEC-177): what happened, and the way to plans while plans
 * are shown (DEC-136). Said in place of the choice, never a toast, and
 * announced, so a refused press is never silent.
 */
export function PaidRefusal({ name }: { name: string }) {
    return (
        <p
            role="alert"
            data-paid-refusal=""
            className="text-xs text-foreground"
        >
            {paidRefusalWords(name)}
            {plansShown() ? (
                <>
                    {" "}
                    <Link
                        href={upgradeHref()}
                        className="font-medium underline underline-offset-2"
                    >
                        See plans
                    </Link>
                </>
            ) : null}
        </p>
    );
}
