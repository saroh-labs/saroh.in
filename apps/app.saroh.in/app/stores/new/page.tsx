import Link from "next/link";

import { CreateStoreForm } from "@/components/stores/create-store-form";
import { requireSession } from "@/lib/session";

export default async function NewStorePage() {
    await requireSession();

    return (
        <main className="mx-auto max-w-4xl p-8">
            <Link
                href="/"
                className="text-muted-foreground text-sm hover:underline"
            >
                ← Back to stores
            </Link>
            <h1 className="mt-4 mb-6 text-2xl font-semibold">Create a store</h1>
            <CreateStoreForm />
        </main>
    );
}
