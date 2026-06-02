import { notFound } from "next/navigation";

import { StoreSettingsForm } from "@/components/stores/store-settings-form";
import { requireSession } from "@/lib/session";
import { getStoreForOwner } from "@/lib/stores/service";

export default async function StoreSettingsPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    const session = await requireSession();
    const store = await getStoreForOwner(storeId, session.user.id);
    if (!store) notFound();

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-medium">Settings</h2>
                <p className="text-muted-foreground text-sm">
                    Edit this store&apos;s basic details.
                </p>
            </div>
            <StoreSettingsForm store={store} />
        </div>
    );
}
