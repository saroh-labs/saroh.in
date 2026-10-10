import Link from "next/link";
import type { ReactNode } from "react";

/**
 * "Bookings › Class packs › Ten classes": where a pack sits, for the page
 * header's breadcrumb. `here` is the pack's name, "New pack", or nothing
 * when it isn't known (a pack that couldn't be read).
 */
export function packCrumbs(here: string | null): ReactNode[] {
    return [
        <Link key="bookings" href="/bookings">
            Bookings
        </Link>,
        <Link key="packs" href="/class-packs">
            Class packs
        </Link>,
        ...(here ? [here] : []),
    ];
}
