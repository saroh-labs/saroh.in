import "server-only";

import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import type { NoAsk } from "@/lib/settings/queries";

import { dataExportsRead } from "./queries";
import { listDataExports } from "./service";
import type { DataExportList, DataExportView } from "./words";

/** Your data: the owner's alone, by role, as the API has it (DEC-120). */
export async function mayReadData(): Promise<boolean> {
    return (await activeOrganizationOnce())?.role === "OWNER";
}

/** An export as its line draws it, field by field: never a link or a file key. */
export function exportFacts(e: DataExportView): DataExportView {
    return {
        id: e.id,
        status: e.status,
        requestedAt: e.requestedAt,
        readyAt: e.readyAt,
        expiresAt: e.expiresAt,
        sizeBytes: e.sizeBytes,
        counts: e.counts
            ? {
                  files: e.counts.files,
                  media: {
                      included: e.counts.media.included,
                      leftOut: e.counts.media.leftOut,
                      bytes: e.counts.media.bytes,
                  },
              }
            : null,
        failure: e.failure,
    };
}

export const dataExportsServer: ServerRead<NoAsk, DataExportList> = {
    read: dataExportsRead,
    service: async () => {
        const read = await listDataExports();
        return {
            exports: (read?.exports ?? []).map(exportFacts),
            inProgress: read?.inProgress ?? false,
        };
    },
};
