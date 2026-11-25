"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { SettingsSectionError } from "@/components/settings/page/settings-section-error";
import type { SettingsSection } from "@/lib/settings/section-failure";

/** The tab's loading or failed state, or its view once read. */
export function Drawn<T>({
    query,
    section,
    loading,
    children,
}: {
    query: UseQueryResult<T>;
    section: SettingsSection;
    loading: ReactNode;
    children: (data: T) => ReactNode;
}) {
    if (query.data !== undefined) return children(query.data);
    if (query.isError) {
        return (
            <SettingsSectionError
                section={section}
                error={query.error}
                retry={() => void query.refetch()}
            />
        );
    }
    return loading;
}
