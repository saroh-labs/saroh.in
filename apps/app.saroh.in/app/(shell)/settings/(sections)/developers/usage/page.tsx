import { notFound } from "next/navigation";

import { UsageContainer } from "@/components/settings/developers/containers";
import { activeBusinessZone } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { apiAreaOn } from "@/lib/settings/api-area-switch";

/**
 * Settings › API and AI apps › Usage (R14): this business's own caps and
 * this minute's calls. Everyone reads it; a Member sees the AI row only.
 *
 * On React Query (DEC-259): the minute loads in the browser
 * (`/api/settings/developers/usage`, `live`), and Refresh reads it again.
 */
export const metadata = { title: "Usage · API and AI apps · Settings" };

export default async function UsagePage() {
    if (!apiAreaOn()) notFound();
    await requireSession();
    return <UsageContainer zone={await activeBusinessZone()} />;
}
