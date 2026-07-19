import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
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
        <main className="mx-auto max-w-4xl p-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Services</h1>
                <div className="flex items-center gap-3">
                    <Button asChild variant="outline">
                        <Link href="/bookings">Bookings</Link>
                    </Button>
                    {services.length > 0 && (
                        <Button asChild>
                            <Link href="/services/new">New service</Link>
                        </Button>
                    )}
                    <Link
                        href="/"
                        className="text-sm text-muted-foreground hover:underline"
                    >
                        ← Dashboard
                    </Link>
                </div>
            </div>

            {services.length === 0 ? (
                <Card className="border-dashed">
                    <CardHeader className="items-center text-center">
                        <CardTitle>No services yet</CardTitle>
                        <CardDescription>
                            Create a bookable service, add availability windows,
                            then drop a Booking section onto a site so visitors
                            can book.
                        </CardDescription>
                        <div className="pt-4">
                            <Button asChild>
                                <Link href="/services/new">
                                    Create a service
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                </Card>
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
