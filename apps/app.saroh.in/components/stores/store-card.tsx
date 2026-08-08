import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import Link from "next/link";

export function StoreCard({
    store,
}: {
    store: { id: string; name: string; slug: string };
}) {
    return (
        <Link href={`/stores/${store.id}`} className="block">
            {/* The card is the link target, so it gets the hover lift. The local
                transition + hover border are dropped: wk-surface owns both, and
                two rules on the same property fight over source order. */}
            <Card className="wk-surface">
                <CardHeader>
                    <CardTitle>{store.name}</CardTitle>
                    <CardDescription>/{store.slug}</CardDescription>
                </CardHeader>
            </Card>
        </Link>
    );
}
