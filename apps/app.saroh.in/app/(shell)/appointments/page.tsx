import { Button } from "@saroh/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import { PageHeader } from "@saroh/ui/page-header";
import { CalendarDays, Clock, Settings } from "lucide-react";
import Link from "next/link";

import { listServices, listUpcomingBookings } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

/**
 * Appointments operations hub (#121, Task 6). Unifies the module's navigation —
 * Schedule, Services, and Settings — behind one entry, with an at-a-glance
 * operational summary, without collapsing the domain concepts: Services stay
 * reusable booking definitions; bookings stay immutable operational records.
 * (A calendar/agenda view is a browser-verified follow-up; today Schedule links
 * to the existing bookings list.)
 */
export const metadata = { title: "Appointments" };

const NAV = [
    {
        href: "/bookings",
        title: "Schedule",
        description: "Upcoming and past bookings.",
        icon: CalendarDays,
    },
    {
        href: "/services",
        title: "Services",
        description: "The bookable services you offer.",
        icon: Clock,
    },
    {
        href: "/services",
        title: "Availability",
        description: "When customers can book you.",
        icon: Settings,
    },
];

export default async function AppointmentsPage() {
    await requireSession();
    const [services, upcoming] = await Promise.all([
        listServices(),
        listUpcomingBookings(),
    ]);

    return (
        <main className="mx-auto max-w-4xl p-8">
            <PageHeader
                title="Appointments"
                description="Everything for taking bookings — your schedule, services, and availability."
                actions={
                    <Button asChild variant="brand">
                        <Link href="/services/new">New service</Link>
                    </Button>
                }
            />

            <div className="mb-8 grid gap-4 sm:grid-cols-2">
                <Card>
                    <CardHeader className="pb-1">
                        <CardTitle className="text-sm text-muted-foreground">
                            Upcoming bookings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                        {upcoming.length}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-1">
                        <CardTitle className="text-sm text-muted-foreground">
                            Services
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">
                        {services.length}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                {NAV.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.title}
                            href={item.href}
                            className="rounded-lg border p-4 transition-colors hover:bg-accent"
                        >
                            <Icon className="mb-2 size-5 text-muted-foreground" />
                            <p className="font-medium">{item.title}</p>
                            <p className="text-sm text-muted-foreground">
                                {item.description}
                            </p>
                        </Link>
                    );
                })}
            </div>
        </main>
    );
}
