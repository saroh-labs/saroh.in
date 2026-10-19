"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { ACCOUNTS_URL } from "@/lib/links";
import { keepReferral } from "@/lib/referral";

/**
 * Keeps a business's referral code (DEC-156) and an account manager's
 * link (DEC-169, `?am=`) from the link a visitor arrived by
 * (`lib/referral.ts`), on whichever page they land. It draws nothing and
 * sends nothing; the pages stay the built files they are.
 */
export function ReferralKeeper() {
    const pathname = usePathname();
    useEffect(() => {
        keepReferral(ACCOUNTS_URL);
    }, [pathname]);
    return null;
}
