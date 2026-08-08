import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import Link from "next/link";

export function StoresEmptyState() {
    return (
        <EmptyState
            title="No stores yet"
            description="Create your first store to start building."
            action={
                <Button asChild variant="brand">
                    <Link href="/stores/new">Create a store</Link>
                </Button>
            }
        />
    );
}
