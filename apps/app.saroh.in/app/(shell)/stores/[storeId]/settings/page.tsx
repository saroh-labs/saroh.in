import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { StoreSettingsForm } from "@/components/stores/store-settings-form";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function StoreSettingsPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    return (
        <div className="space-y-6">
            <PageHeader
                title="Settings"
                description="Edit this store's basic details."
            />
            <StoreSettingsForm store={store} />
        </div>
    );
}
