"use client";

import { RegionError } from "@/components/states/region-error";

/** A Billing tab failed to load: caught here, so the header, the search and the tabs stand. */
export default function TabError(props: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <RegionError {...props} boundary="admin/billing" things="this tab" />
    );
}
