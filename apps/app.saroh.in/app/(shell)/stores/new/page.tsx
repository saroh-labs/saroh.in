import { PageHeader } from "@saroh/ui/page-header";

import { CreateStoreForm } from "@/components/stores/create-store-form";
import { requireSession } from "@/lib/session";

export default async function NewStorePage() {
    await requireSession();

    return (
        <main className="mx-auto max-w-2xl p-8">
            <PageHeader
                title="Create a store"
                description="Set up a new store to start selling."
            />
            <CreateStoreForm />
        </main>
    );
}
