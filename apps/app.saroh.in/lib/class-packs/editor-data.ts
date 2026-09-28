import { resolveActiveOrganization } from "@/lib/organizations/service";
import { businessCurrencyOf } from "@/lib/services/editor-data";
import type { Service } from "@/lib/services/service";
import { readServices } from "@/lib/services/service";

import { canReadPacks, canWritePacks } from "./access";
import type { PackKind, PackServiceOption } from "./pack-editor";

/**
 * What the Pack Editor's pages read besides the pack (E18), server-only:
 * whether this person may see and change packs, and the services a pack can
 * pay for. A services read that failed is null, never an empty list the
 * editor would save over the pack's choice.
 */
export interface PackEditorContext {
    canRead: boolean;
    canWrite: boolean;
    services: PackServiceOption[] | null;
    /** The business's currency, for a new pack's price. */
    currency: string;
}

function toOption(s: Service): PackServiceOption {
    return {
        id: s.id,
        name: s.name,
        capacity: s.capacity,
        priceCents: s.priceCents,
        currency: s.currency,
        active: s.status === "ACTIVE",
    };
}

export async function loadPackEditorContext(): Promise<PackEditorContext> {
    const [organization, read] = await Promise.all([
        resolveActiveOrganization(),
        readServices(),
    ]);
    return {
        canRead: canReadPacks(organization),
        canWrite: canWritePacks(organization),
        services: read.ok
            ? read.services
                  .map(toOption)
                  .sort((a, b) => a.name.localeCompare(b.name))
            : null,
        currency: read.ok ? businessCurrencyOf(read.services) : "INR",
    };
}

/** `?kind=one-to-one` opens a new one-to-one pack; anything else, classes. */
export function kindFromQuery(kind: string | undefined): PackKind {
    return kind === "one-to-one" ? "ONE_TO_ONE" : "CLASSES";
}
