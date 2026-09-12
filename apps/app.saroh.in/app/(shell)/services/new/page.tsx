import { PageHeader } from "@saroh/ui/page-header";

import { CreateServiceForm } from "@/components/bookings/create-service-form";
import { PageContainer } from "@/components/shared/page-container";
import { requireSession } from "@/lib/session";

/**
 * New-service page (S4-003). A back link, a heading, and the client
 * CreateServiceForm. Availability windows are added afterwards on the service
 * editor the form routes to on success. Mirrors the new-site page shell.
 */
export default async function NewServicePage() {
    await requireSession();

    return (
        <PageContainer width="form">
            <PageHeader
                title="Create a service"
                description="Name your bookable service and set its duration; add availability next."
            />
            <CreateServiceForm />
        </PageContainer>
    );
}
