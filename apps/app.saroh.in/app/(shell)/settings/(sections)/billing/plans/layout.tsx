import { notFound } from "next/navigation";

import { plansShown } from "@/lib/saroh-billing/plans-shown";

/**
 * Change plan exists only while plans are shown. Plan and billing's own
 * layout lets a Global business in for its Free note (DEC-211), so this
 * screen answers its not-found here, above its loading boundary, as a 404
 * rather than a streamed 200.
 */
export default function ChangePlanLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    if (!plansShown()) notFound();
    return children;
}
