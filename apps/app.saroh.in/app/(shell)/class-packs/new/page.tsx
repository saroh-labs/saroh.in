import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { PackForm } from "@/components/class-packs/pack-form";
import { PageContainer } from "@/components/shared/page-container";
import { listPacks } from "@/lib/class-packs/service";
import { listServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New class pack" };

/** Class packs → New: classes, days, price and what it pays for. */
export default async function NewClassPackPage() {
    await requireSession();
    const [services, packs] = await Promise.all([listServices(), listPacks()]);
    const options = services
        .filter((s) => s.status === "ACTIVE")
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
                        "New",
                    ]}
                    title="New class pack"
                    actions={
                        <Button variant="outline" asChild>
                            <Link href="/class-packs">Back to class packs</Link>
                        </Button>
                    }
                />
                {options.length === 0 ? (
                    <p className="max-w-[60ch] text-[13.5px] text-muted-foreground">
                        A pack pays for bookings on your services, and there is
                        none taking bookings yet.{" "}
                        <Link
                            href="/services/new"
                            className="font-medium text-foreground underline underline-offset-4"
                        >
                            Make a service
                        </Link>{" "}
                        first.
                    </p>
                ) : (
                    <PackForm
                        services={options}
                        // The currency the business last priced a pack in,
                        // else a service's own.
                        defaultCurrency={
                            packs.at(-1)?.currency ??
                            services.find((s) => s.currency)?.currency ??
                            "INR"
                        }
                    />
                )}
            </div>
        </PageContainer>
    );
}
