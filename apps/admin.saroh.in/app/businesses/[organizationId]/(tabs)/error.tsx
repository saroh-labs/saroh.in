"use client";

import { RegionError } from "@/components/states/region-error";

/** A business's tab failed to load: caught here, so the header and the other tabs stand. */
export default function TabError(props: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <RegionError
            {...props}
            boundary="admin/business-tab"
            things="this tab"
        />
    );
}
