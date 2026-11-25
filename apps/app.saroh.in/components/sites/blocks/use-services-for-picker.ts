import { listServicesForPicker } from "@/lib/services/actions";
import type { ServicesPick } from "@/lib/sites/queries";
import { usePickerRead } from "@/lib/sites/use-picker";

import type { ServicesLoad } from "@/components/sites/section-fields";

/**
 * The org's services for the booking and services-list pickers: one cached
 * read every picker shares (U33), read again on "Try again"; Services are
 * authored in the service editor, never inline in the site editor. A
 * failed read is kept distinct from an empty one, so a picker never says
 * "No services yet" or calls a chosen service deleted because the read
 * failed (review of #255). A price changed in the editor's price sheet
 * (U48) reads them again.
 */
export function useServicesForPicker(
    /** Bump it to read again, keeping the rows on screen meanwhile. */
    version = 0,
): ServicesLoad {
    const { read, retry } = usePickerRead<ServicesPick>(
        "services",
        listServicesForPicker,
        version,
    );
    if (read === "loading") return { status: "loading" };
    if (read.ok) return { status: "ready", services: read.services };
    return { status: "failed", forbidden: read.forbidden, retry };
}
