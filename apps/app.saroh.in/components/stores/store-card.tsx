import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import Link from "next/link";

export function StoreCard({
    store,
}: {
    store: { id: string; name: string; slug: string };
}) {
    return (
        <Link href={`/stores/${store.id}`} className="block">
            <Card className="transition-colors hover:border-foreground/30">
                <CardHeader>
                    <CardTitle>{store.name}</CardTitle>
                    <CardDescription>/{store.slug}</CardDescription>
                </CardHeader>
            </Card>
        </Link>
    );
}
