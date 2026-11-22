"use client";

import { RegionError } from "@/components/states/region-error";

/** A teammate's tab failed to load: caught here, so their header and tabs stand. */
export default function TabError(props: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <RegionError
            {...props}
            boundary="admin/teammate-tab"
            things="this tab"
        />
    );
}
