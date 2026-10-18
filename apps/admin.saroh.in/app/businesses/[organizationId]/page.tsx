import { redirect } from "next/navigation";

import type { BusinessTabProps } from "@/lib/business-page";

/**
 * A business's address opens its Overview (admin plan U2): every tab is its
 * own address under it, and links from elsewhere in the console that name
 * only the business keep working.
 */
export default async function BusinessPage({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    redirect(`/businesses/${encodeURIComponent(organizationId)}/overview`);
}
