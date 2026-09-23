import { redirect } from "next/navigation";

import { accountsUrl } from "@/lib/accounts";

/**
 * Choosing a business lives in accounts.saroh.in, beside a person's roles and
 * profile, so there is one place to do it. This address is kept so old links
 * and bookmarks still land somewhere useful.
 */
export default function ChoosePage(): never {
    redirect(`${accountsUrl}/businesses`);
}
