import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { notFound } from "next/navigation";

/**
 * Store Overview. Re-resolves the store with the same owner gate as the
 * layout (defense in depth — never trust the route alone) and renders basic
 * store info plus clearly-marked "coming soon" placeholders for future
 * sections.
 */
export default async function StoreOverviewPage({
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
            <Card>
                <CardHeader>
                    <CardTitle>{store.name}</CardTitle>
                    <CardDescription>/{store.slug}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        {store.description ?? "No description yet."}
                    </p>
                </CardContent>
            </Card>

            <EmptyState
                title="No insights yet"
                description="Once you add products and take orders, a summary of your store will appear here."
            />
        </div>
    );
}
