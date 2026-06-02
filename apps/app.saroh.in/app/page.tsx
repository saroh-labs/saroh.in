import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { StoreCard } from "@/components/stores/store-card";
import { StoresEmptyState } from "@/components/stores/stores-empty-state";
import { requireSession } from "@/lib/session";
import { listStoresForUser } from "@/lib/stores/service";

export default async function Home() {
    const session = await requireSession();
    const stores = await listStoresForUser(session.user.id);

    return (
        <main className="mx-auto max-w-4xl p-8">
            <div className="mb-8 flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                    {session.user.email}
                </span>
                <SignOutButton />
            </div>

            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Your stores</h1>
                {stores.length > 0 && (
                    <Button asChild>
                        <Link href="/stores/new">New store</Link>
                    </Button>
                )}
            </div>

            {stores.length === 0 ? (
                <StoresEmptyState />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {stores.map((store) => (
                        <StoreCard key={store.id} store={store} />
                    ))}
                </div>
            )}
        </main>
    );
}
