import { NotesPanel } from "@/components/business/notes-panel";
import { SessionTab } from "@/components/business/session-tab";
import { Panel } from "@/components/panel";
import type { BusinessTabProps } from "@/lib/business-page";
import { businessGate, tabTitle } from "@/lib/business-page";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Notes", organizationId) };
}

/**
 * Notes (admin plan U6): for the next person on Saroh's team; the business
 * never sees them. They read inside a support session.
 */
export default async function NotesTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;

    return (
        <SessionTab staff={staff} organizationId={organizationId}>
            {(view) => {
                const id = view.facts.id;
                return (
                    <Panel
                        title="Notes"
                        description="For the next person on Saroh's team. The business never sees them."
                        data={view.notes}
                    >
                        {(notes) => (
                            <NotesPanel
                                organizationId={id}
                                notes={notes}
                                canWrite
                            />
                        )}
                    </Panel>
                );
            }}
        </SessionTab>
    );
}
