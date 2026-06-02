import { Button } from "@saroh/ui/button";
import Link from "next/link";

export function StoresEmptyState() {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <h2 className="text-lg font-medium">No stores yet</h2>
            <p className="text-muted-foreground mt-1 text-sm">
                Create your first store to start building.
            </p>
            <Button asChild className="mt-4">
                <Link href="/stores/new">Create a store</Link>
            </Button>
        </div>
    );
}
