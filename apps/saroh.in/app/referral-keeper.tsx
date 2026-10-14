"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { ACCOUNTS_URL } from "@/lib/links";
import { keepReferral } from "@/lib/referral";

/**
 * Keeps a business's referral code from the link a visitor arrived by
 * (DEC-156, `lib/referral.ts`), on whichever page they land. It draws
 * nothing and sends nothing; the pages stay the built files they are.
 */
export function ReferralKeeper() {
    const pathname = usePathname();
    useEffect(() => {
        keepReferral(ACCOUNTS_URL);
    }, [pathname]);
    return null;
}
