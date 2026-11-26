import { cache } from "react";

import { FormEntriesContainer } from "@/components/sites/area/site-screens";
import { getForm } from "@/lib/forms/service";
import { recordTitle } from "@/lib/page-title";
import { requireSession } from "@/lib/session";

// The tab's title reads the form once.
const readForm = cache((formId: string) => getForm(formId));

/**
 * The form's own name in the tab, then "Website"; "Form entries" when it
 * can't be read or belongs to another site. Never who sent an entry.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ siteId: string; formId: string }>;
}) {
    const { siteId, formId } = await params;
    return recordTitle(
        () => readForm(formId),
        (form) => (form.siteId === siteId ? form.name : null),
        "Form entries",
        "Website",
    );
}

/**
 * One form's entries, newest first (#385). On React Query (DEC-259): the
 * entries load in the browser, `form:read` asked by the route; a form of
 * another site (or business) is the not-found page, a role without
 * `form:read` the no-access page, as before.
 */
export default async function FormEntriesPage({
    params,
}: {
    params: Promise<{ siteId: string; formId: string }>;
}) {
    const { siteId, formId } = await params;
    await requireSession();
    return <FormEntriesContainer siteId={siteId} formId={formId} />;
}
