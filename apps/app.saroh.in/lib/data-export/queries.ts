import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";

import type { DataExportList } from "./words";

/**
 * Settings › Your data on React Query (DEC-259): the owner's downloads,
 * each as the line draws it. Never a download link: one is made only when
 * Download is pressed (`getDataExportLink`), and opened at once.
 * `records`: an export in progress finishes on its own; Check again reads it.
 */
export const dataExportsRead = defineRead<DataExportList>()({
    key: (orgId) => domainKey("settings", orgId, "data"),
    route: { path: "/api/settings/data", params: {} },
    tier: "records",
});
