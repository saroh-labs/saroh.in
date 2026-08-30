import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { CsvImport } from "@/components/stores/csv-import";
import { describeImport } from "@/lib/imports/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

/**
 * CSV import for customers (#175). Store-access gated; the api rejects writes
 * from VIEWER members, so the page renders for anyone with store access and the
 * import itself is where the write role is enforced.
 *
 * The mappable field list comes from the api rather than being restated here,
 * so it cannot drift from the DTOs that actually validate each row.
 */
export default async function ImportCustomersPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();

    const [store, descriptor] = await Promise.all([
        getStore(storeId),
        describeImport(storeId, "customers"),
    ]);
    if (!store || !descriptor) notFound();

    return (
        <div className="space-y-6">
            <PageHeader
                title="Import customers"
                description="Bring your customer list in from a spreadsheet."
            />
            <CsvImport
                storeId={storeId}
                descriptor={descriptor}
                backHref={`/stores/${storeId}/customers`}
            />
        </div>
    );
}
