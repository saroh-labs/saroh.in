import { PageHeader } from "@saroh/ui/page-header";

import { PageContainer } from "@/components/shared/page-container";
import { CreateStoreForm } from "@/components/stores/create-store-form";
import { requireSession } from "@/lib/session";

export default async function NewStorePage() {
    await requireSession();

    return (
        <PageContainer width="form">
            <PageHeader
                title="Create a store"
                description="Set up a new store to start selling."
            />
            <CreateStoreForm />
        </PageContainer>
    );
}
