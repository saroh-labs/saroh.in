import { StoreNav } from "@/components/stores/store-nav";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Per-store shell. Owner-gated: resolves the accounts session, then loads the
 * store ONLY if the signed-in user owns it (getStore returns null otherwise).
 * A non-owner or unauthenticated visitor gets a 404 via notFound() — no store
 * data is rendered or leaked. Global chrome (brand, org switcher, nav) lives in
 * AppHeader; this layout only renders the store breadcrumb + context.
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
            <nav
                className="mb-4 text-sm text-muted-foreground"
                aria-label="Breadcrumb"
            >
                <Link
                    href="/"
                    className="hover:text-foreground hover:underline"
                >
                    Stores
                </Link>
                <span className="mx-1.5">/</span>
                <span className="text-foreground">{store.name}</span>
            </nav>
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
