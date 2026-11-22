"use client";

import { RegionError } from "@/components/states/region-error";

/** A Team tab failed to load: caught here, so the header and tabs stand. */
export default function TabError(props: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <RegionError {...props} boundary="admin/team-tab" things="this tab" />
    );
}
