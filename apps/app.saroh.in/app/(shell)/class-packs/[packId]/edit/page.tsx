import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PackForm } from "@/components/class-packs/pack-form";
import { PageContainer } from "@/components/shared/page-container";
import { getPack } from "@/lib/class-packs/service";
import { listServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Edit class pack" };

/** Change a pack. What was already sold keeps its classes, price and days. */
export default async function EditClassPackPage({
    params,
}: {
    params: Promise<{ packId: string }>;
}) {
    await requireSession();
    const { packId } = await params;
    const [pack, services] = await Promise.all([
        getPack(packId),
        listServices(),
    ]);
    if (!pack) notFound();

    // Services taking bookings, and any the pack already names — so a
    // paused one stays chosen rather than vanishing from the picker.
    const named = new Set(pack.services.map((s) => s.id));
    const options = services
        .filter((s) => s.status === "ACTIVE" || named.has(s.id))
        .map((s) => ({ id: s.id, label: s.name }));

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader
                    className="mb-0"
                    breadcrumb={[
                        <Link
                            key="packs"
                            href="/class-packs"
                            className="hover:text-foreground"
                        >
                            Class packs
                        </Link>,
                        pack.name,
                    ]}
                    title={`Edit ${pack.name}`}
                    actions={
                        <Button variant="outline" asChild>
                            <Link href="/class-packs">Back to class packs</Link>
                        </Button>
                    }
                />
                <PackForm
                    pack={pack}
                    services={options}
                    defaultCurrency={pack.currency}
                />
            </div>
        </PageContainer>
    );
}
