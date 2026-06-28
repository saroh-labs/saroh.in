import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";
import { Badge } from "@saroh/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { notFound } from "next/navigation";

const COMING_SOON: { title: string; description: string }[] = [];

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
    const session = await requireSession();
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

            <section
                className={COMING_SOON.length === 0 ? "hidden" : undefined}
            >
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                    Coming soon
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {COMING_SOON.map((section) => (
                        <Card key={section.title} className="opacity-70">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    {section.title}
                                    <Badge variant="secondary">Soon</Badge>
                                </CardTitle>
                                <CardDescription>
                                    {section.description}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            </section>
        </div>
    );
}
