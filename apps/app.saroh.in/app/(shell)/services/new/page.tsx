import { ServiceEditorState } from "@/components/services/service-editor/editor-states";
import { ServiceEditor } from "@/components/services/service-editor/service-editor";
import { loadEditorContext } from "@/lib/services/editor-data";
import { showKind } from "@/lib/services/service-editor";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New service" };

/**
 * Bookings › Services › New service (E2): the Service Editor, empty. It
 * opens from New service on Services, the command menu and the site
 * editor's pickers; adding one lands on its own page.
 */
export default async function NewServicePage() {
    await requireSession();
    const read = await loadEditorContext();
    if (!read.ok) {
        return (
            <ServiceEditorState
                state={read.forbidden ? "forbidden" : "failed"}
                retryHref="/services/new"
            />
        );
    }
    const {
        services,
        staff,
        hasPage,
        hasStorefront,
        canEdit,
        timezone,
        currency,
    } = read.context;
    return (
        <ServiceEditor
            service={null}
            rules={[]}
            staff={staff?.staff ?? null}
            usage={{ thisWeek: 0, comingUp: 0 }}
            currency={currency}
            timezone={timezone}
            canEdit={canEdit}
            kindUp={showKind(services, null)}
            hasPage={hasPage}
            hasStorefront={hasStorefront}
        />
    );
}
