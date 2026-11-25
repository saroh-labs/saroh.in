import { SiteFormsContainer } from "@/components/sites/area/site-screens";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Forms · Website" };

/**
 * The Forms tab (#385): the forms on this site, and how much has come
 * through each.
 *
 * A form is made in the editor, by adding an enquiry section, so there is
 * nothing to create here — this is where what people sent is read. Each entry
 * also became a contact and a lead; this is the raw record of what they
 * typed, which outlives both. On React Query (DEC-259): read in the browser,
 * `form:read` asked by the route.
 */
export default async function SiteFormsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();
    return <SiteFormsContainer siteId={siteId} />;
}
