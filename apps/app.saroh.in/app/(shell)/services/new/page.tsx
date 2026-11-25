import { ServiceEditorState } from "@/components/services/service-editor/editor-states";
import { NewServiceContainer } from "@/components/services/service-editor/service-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { canReadServices } from "@/lib/services/access";
import { readCanEditServices } from "@/lib/services/editor-data";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

export const metadata = { title: "New service" };

/**
 * Bookings › Services › New service (E2): the Service Editor, empty. It
 * opens from New service on Services, the command menu and the site
 * editor's pickers; adding one lands on its own page.
 *
 * On React Query (DEC-259): the page awaits only its gates; the editor's
 * context (who is on the diary, how people pay, GST, the plan's lock on
 * deposits) is `NewServiceContainer`'s read (`/api/services/editor`),
 * behind the route's loader.
 */
export default async function NewServicePage() {
    await requireSession();
    const [organization, canEdit] = await Promise.all([
        resolveActiveOrganization(),
        readCanEditServices(),
    ]);
    if (!canReadServices(organization)) {
        return (
            <ServiceEditorState state="forbidden" retryHref="/services/new" />
        );
    }
    // A role that can't add one is told so, not shown an empty form it
    // can't fill in (UX-083).
    if (!canEdit) {
        return (
            <ServiceEditorState state="cant-add" retryHref="/services/new" />
        );
    }
    return <NewServiceContainer skeleton={<Loading />} />;
}
