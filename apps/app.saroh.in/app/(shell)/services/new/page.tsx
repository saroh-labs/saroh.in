import { ServiceEditorState } from "@/components/services/service-editor/editor-states";
import { ServiceEditor } from "@/components/services/service-editor/service-editor";
import { rowLock } from "@/lib/billing/access";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { loadEditorContext } from "@/lib/services/editor-data";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New service" };

/**
 * Bookings › Services › New service (E2): the Service Editor, empty. It
 * opens from New service on Services, the command menu and the site
 * editor's pickers; adding one lands on its own page.
 */
export default async function NewServicePage() {
    await requireSession();
    const [read, access] = await Promise.all([
        loadEditorContext(),
        // Deposits are taken online: locked on a plan without it.
        billingAccessOrNull(),
    ]);
    if (!read.ok) {
        return (
            <ServiceEditorState
                state={read.forbidden ? "forbidden" : "failed"}
                retryHref="/services/new"
            />
        );
    }
    const {
        staff,
        hasPage,
        hasStorefront,
        payment,
        canEdit,
        timezone,
        currency,
    } = read.context;
    // A role that can't add one is told so, not shown an empty form it
    // can't fill in (UX-083).
    if (!canEdit) {
        return (
            <ServiceEditorState state="cant-add" retryHref="/services/new" />
        );
    }
    return (
        <ServiceEditor
            service={null}
            rules={[]}
            staff={staff?.staff ?? null}
            usage={{ thisWeek: 0, comingUp: 0 }}
            currency={currency}
            timezone={timezone}
            canEdit={canEdit}
            hasPage={hasPage}
            hasStorefront={hasStorefront}
            paymentsLock={rowLock(access, "payments")}
            payment={payment}
        />
    );
}
