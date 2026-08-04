import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { ServicesView } from "@/components/services/services-view";
import { listServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";
import { viewParam } from "@/lib/views/search-params";

/**
 * Services index for the active organization (S4-003).
 *
 * The page fetches; `ServicesView` decides how to render. Duration, price,
 * capacity and status are columns rather than one run-on description, so two
 * services can be compared without reading two sentences.
 *
 * "New service" is now shown unconditionally. It used to be hidden when the
 * list was empty, on the theory that the empty state's own button covered it —
 * but `DataView` owns the empty state, and a merchant with zero services is
 * precisely the one who needs the create action visible.
 */
export const metadata = { title: "Services" };

export default async function ServicesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [services, params] = await Promise.all([
        listServices(),
        searchParams,
    ]);

    return (
        <main className="mx-auto w-full max-w-7xl p-6 sm:p-8">
            <PageHeader
                title="Services"
                description="Bookable services visitors can reserve from your sites."
                actions={
                    <>
                        <Button asChild variant="outline">
                            <Link href="/bookings">Bookings</Link>
                        </Button>
                        <Button asChild variant="brand">
                            <Link href="/services/new">New service</Link>
                        </Button>
                    </>
                }
            />
            <div className="mt-6">
                <ServicesView
                    services={services}
                    initialView={viewParam(params)}
                />
            </div>
        </main>
    );
}
