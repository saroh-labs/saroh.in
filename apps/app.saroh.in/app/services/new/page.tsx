import Link from "next/link";

import { CreateServiceForm } from "@/components/bookings/create-service-form";
import { requireSession } from "@/lib/session";

/**
 * New-service page (S4-003). A back link, a heading, and the client
 * CreateServiceForm. Availability windows are added afterwards on the service
 * editor the form routes to on success. Mirrors the new-site page shell.
 */
export default async function NewServicePage() {
    await requireSession();

    return (
        <main className="mx-auto max-w-4xl p-8">
            <Link
                href="/services"
                className="text-sm text-muted-foreground hover:underline"
            >
                ← Back to services
            </Link>
            <h1 className="mb-6 mt-4 text-2xl font-semibold">
                Create a service
            </h1>
            <CreateServiceForm />
        </main>
    );
}
