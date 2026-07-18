import { StoreNav } from "@/components/stores/store-nav";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";
import { notFound } from "next/navigation";

/**
 * Per-store shell. Owner-gated: resolves the accounts session, then loads the
 * store ONLY if the signed-in user owns it (getStoreForOwner returns null
 * otherwise). A non-owner or unauthenticated visitor gets a 404 via
 * notFound() — no store data is rendered or leaked.
 */
export default async function StoreLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    return (
        <main className="mx-auto max-w-5xl p-8">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">
                    {store.name}
                </h1>
                <p className="text-sm text-muted-foreground">/{store.slug}</p>
            </header>
            <StoreNav storeId={storeId} />
            <div className="mt-6">{children}</div>
        </main>
    );
}
