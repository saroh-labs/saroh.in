import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { contactName, formatValue } from "@/lib/crm/format";
import type { LeadListItem } from "@/lib/leads/service";
import { listLeads } from "@/lib/leads/service";
import { requireSession } from "@/lib/session";

/**
 * Leads index for the active organization (S3-005). Lists the org's leads
 * (newest first), each showing its current stage + contact; cards link to the
 * lead detail (where the owner can move stages / change status). A link to the
 * pipeline board sits alongside for the column view of the same data.
 */
export default async function LeadsPage() {
    await requireSession();

    const leads: LeadListItem[] = await listLeads();

    return (
        <main className="mx-auto max-w-5xl p-8">
            <PageHeader
                title="Leads"
                description="Opportunities in your pipeline, newest first."
                actions={
                    <Button asChild variant="outline">
                        <Link href="/pipeline">Pipeline board</Link>
                    </Button>
                }
            />

            {leads.length === 0 ? (
                <EmptyState
                    title="No leads yet"
                    description="Leads appear here as enquiries come in. You can also create one by hand from a contact."
                />
            ) : (
                <div className="grid gap-3">
                    {leads.map((lead) => {
                        const amount = formatValue(lead.value);
                        return (
                            <Link key={lead.id} href={`/leads/${lead.id}`}>
                                <Card className="transition-colors hover:bg-muted/40">
                                    <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                                        <div>
                                            <CardTitle className="text-base">
                                                {lead.title}
                                            </CardTitle>
                                            <CardDescription>
                                                {lead.contact
                                                    ? contactName(lead.contact)
                                                    : "Unknown contact"}
                                                {amount ? ` · ${amount}` : ""}
                                            </CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {lead.stage && (
                                                <Badge variant="secondary">
                                                    {lead.stage.name}
                                                </Badge>
                                            )}
                                            <Badge
                                                variant={
                                                    lead.status === "WON"
                                                        ? "default"
                                                        : lead.status === "LOST"
                                                          ? "destructive"
                                                          : "outline"
                                                }
                                            >
                                                {lead.status}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
