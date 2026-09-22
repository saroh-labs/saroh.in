import { Badge } from "@saroh/ui/badge";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AvailabilityRulesEditor } from "@/components/bookings/availability-rules-editor";
import { EditServiceForm } from "@/components/bookings/edit-service-form";
import { PageContainer } from "@/components/shared/page-container";
import { getService, listRules } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

/**
 * Service editor (S4-003). Resolves the service (notFound when missing / not
 * permitted), loads its availability rules, and renders the terms editor plus
 * the AvailabilityRulesEditor. Editing happens client-side; only Save/Archive
 * hit the api.
 */
export default async function ServiceEditorPage({
    params,
}: {
    params: Promise<{ serviceId: string }>;
}) {
    const { serviceId } = await params;
    await requireSession();

    const service = await getService(serviceId);
    if (!service) notFound();

    const rules = await listRules(serviceId);

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={[
                    <Link
                        key="services"
                        href="/services"
                        className="hover:text-foreground"
                    >
                        Services
                    </Link>,
                    service.name,
                ]}
                title={service.name}
                description="Set this service's terms and weekly availability."
                actions={
                    // The same words as the services list's filters.
                    <Badge
                        variant={
                            service.status === "ACTIVE" ? "success" : "neutral"
                        }
                    >
                        {service.status === "ACTIVE"
                            ? "Bookable"
                            : "Not bookable"}
                    </Badge>
                }
            />

            <section className="mb-10">
                <h2 className="mb-3 text-lg font-medium">Details</h2>
                <EditServiceForm service={service} />
            </section>

            <section>
                <h2 className="mb-1 text-lg font-medium">Availability</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                    Weekly windows in {service.timezone}. Visitors can book any
                    open slot inside these windows.
                </p>
                <AvailabilityRulesEditor
                    serviceId={service.id}
                    initialRules={rules}
                />
            </section>
        </PageContainer>
    );
}
