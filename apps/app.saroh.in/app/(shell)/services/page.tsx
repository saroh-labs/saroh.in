import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import type { Service } from "@/lib/services/service";
import { listServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

/**
 * Services index for the active organization (S4-003). Lists the org's bookable
 * services (newest first), each showing its duration, capacity and status;
 * cards link to the service editor (terms + availability windows). A link to
 * the bookings calendar sits alongside. Mirrors the leads/sites index shells.
 */
export default async function ServicesPage() {
    await requireSession();

    const services: Service[] = await listServices();

    return (
        <main className="mx-auto max-w-5xl p-8">
            <PageHeader
                title="Services"
                description="Bookable services visitors can reserve from your sites."
                actions={
                    <>
                        <Button asChild variant="outline">
                            <Link href="/bookings">Bookings</Link>
                        </Button>
                        {services.length > 0 && (
                            <Button asChild variant="brand">
                                <Link href="/services/new">New service</Link>
                            </Button>
                        )}
                    </>
                }
            />

            {services.length === 0 ? (
                <EmptyState
                    title="No services yet"
                    description="Create a bookable service, add availability windows, then drop a Booking section onto a site so visitors can book."
                    action={
                        <Button asChild variant="brand">
                            <Link href="/services/new">Create a service</Link>
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-3">
                    {services.map((service) => (
                        <Link key={service.id} href={`/services/${service.id}`}>
                            <Card className="transition-colors hover:bg-muted/40">
                                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                                    <div>
                                        <CardTitle className="text-base">
                                            {service.name}
                                        </CardTitle>
                                        <CardDescription>
                                            {service.durationMinutes} min
                                            {service.capacity > 1
                                                ? ` · capacity ${service.capacity}`
                                                : ""}{" "}
                                            · {service.timezone}
                                        </CardDescription>
                                    </div>
                                    <Badge
                                        variant={
                                            service.status === "ACTIVE"
                                                ? "default"
                                                : "outline"
                                        }
                                    >
                                        {service.status}
                                    </Badge>
                                </CardHeader>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
