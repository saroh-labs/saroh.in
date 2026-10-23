import { redirect } from "next/navigation";

import { flagsRedirect } from "@/lib/releases";

/**
 * The old Releases address. Releases now live at `/releases` (R11); an old
 * link, `?release=KEY` (or the inspector's `?flag=KEY`), lands on that
 * release's page, and `&organizationId=` on its Who has it.
 */
export default async function FlagsRedirect({
    searchParams,
}: {
    searchParams: Promise<{
        release?: string;
        flag?: string;
        organizationId?: string;
    }>;
}) {
    redirect(flagsRedirect(await searchParams));
}
