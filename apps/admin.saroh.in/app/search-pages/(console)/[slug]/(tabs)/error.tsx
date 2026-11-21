"use client";

import { RegionError } from "@/components/states/region-error";

/** A search page's tab failed to load: caught here, so its header and tabs stand. */
export default function TabError(props: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <RegionError
            {...props}
            boundary="admin/search-page-tab"
            things="this tab"
        />
    );
}
