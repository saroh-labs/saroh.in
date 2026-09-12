import { EmptyState } from "@saroh/ui/empty-state";

import type { SiteDetail } from "@/lib/sites/service";

/**
 * The site's settings, for someone who may read them and not change them
 * (#275).
 *
 * The form renders Save, a domain connect and an image picker — all of which
 * the API refuses without `site:update`. §30: a denial is explained up front,
 * not discovered on the first press. So the values are shown and the controls
 * are absent, with one sentence saying who does have them.
 *
 * Read-only means read-only: this is a server component with no actions at all,
 * rather than the form with its buttons disabled, because a disabled form still
 * holds every field's state and one missed `disabled` is a request the API has
 * to refuse.
 */
export function SiteSettingsRead({ site }: { site: SiteDetail }) {
    const address = site.subdomain ? `${site.subdomain}.saroh.app` : null;

    return (
        <div className="space-y-8">
            <p className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
                You can see this site&apos;s settings. Changing them — its
                address, how it appears in search, and its own domain — is the
                owner&apos;s or an admin&apos;s. A connected domain is not shown
                here: reading it needs the domain permission this role lacks.
            </p>

            <Section title="Address">
                <Row label="Saroh address">{address ?? <Missing />}</Row>
            </Section>

            <Section title="In search results">
                <Row label="Title">{site.seoTitle ?? <Missing />}</Row>
                <Row label="Description">
                    {site.seoDescription ?? <Missing />}
                </Row>
            </Section>

            <Section title="When the link is shared">
                {site.socialImageUrl ? (
                    <div className="space-y-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a merchant's own image, at whatever size they uploaded */}
                        <img
                            src={site.socialImageUrl}
                            alt=""
                            className="max-h-48 rounded-md border object-contain"
                        />
                        <p className="break-all text-xs text-muted-foreground">
                            {site.socialImageUrl}
                        </p>
                    </div>
                ) : (
                    <EmptyState
                        title="No share image"
                        description="Without one, other platforms choose what to show when this site's link is posted."
                    />
                )}
            </Section>
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <h2 className="text-lg font-medium">{title}</h2>
            <div className="divide-y rounded-lg border">{children}</div>
        </section>
    );
}

function Row({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-2 p-4">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="min-w-0 break-all text-sm">{children}</span>
        </div>
    );
}

/** Absent, said as absence rather than as an empty string. */
function Missing() {
    return <span className="text-muted-foreground">Not set</span>;
}
