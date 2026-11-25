"use client";

import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
import { PartialRead } from "@saroh/ui/failed-read";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { PageHeader } from "@saroh/ui/page-header";

import { PageLoading } from "@/components/shared/page/page-loading";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { ReadFailed } from "@/lib/query/client";
import { useServicesList } from "@/lib/services/use-services";

import { ServicesScreen } from "./services-screen";

const BREADCRUMB = ["Bookings", "Services"];
const DESCRIPTION =
    "What customers can book, how long it takes, and who does it.";

/**
 * Bookings › Services on React Query (DEC-259), read in the browser: the
 * header and the read-only line are drawn at once from the page's gate,
 * the rows a skeleton until the list's one read lands. The staff read (who
 * takes each) and the bookings read (how each is used) degrade on their
 * own and say so; the services failing says so in place, with Try again,
 * and a role the API refuses gets the denied card, never the red one.
 */
export function ServicesContainer({ canEdit }: { canEdit: boolean }) {
    const query = useServicesList();
    const data = query.data;

    if (!data) {
        const header = (
            <PageHeader
                className="mb-3.5"
                breadcrumb={BREADCRUMB}
                title="Services"
                description={DESCRIPTION}
            />
        );
        if (query.isError) {
            return (
                <>
                    {header}
                    {query.error instanceof ReadFailed &&
                    query.error.status === 403 ? (
                        // A denial is not a failure: trying again does the
                        // same thing (`saroh-product-states`).
                        <PermissionDeniedState
                            {...whoCanChange({ thing: "Services" })}
                        />
                    ) : (
                        <FailedState
                            title={couldntLoad("your services")}
                            onRetry={() => void query.refetch()}
                            retrying={query.isFetching}
                        />
                    )}
                </>
            );
        }
        return (
            <>
                {header}
                {canEdit ? null : (
                    <ReadOnlyNote>
                        Your role can see services but not change them.
                    </ReadOnlyNote>
                )}
                <PageLoading
                    bare
                    width="full"
                    shape="rows"
                    label="Loading services"
                />
            </>
        );
    }

    return (
        <div>
            {data.staff && data.usage ? null : (
                <PartialRead
                    className="mb-3"
                    things={
                        !data.staff && !data.usage
                            ? "who takes each service or how much each is booked"
                            : !data.staff
                              ? "who takes each service"
                              : "how much each service is booked"
                    }
                />
            )}
            <ServicesScreen
                services={data.services}
                staff={data.staff}
                usage={data.usage}
                currency={data.currency}
                canEdit={canEdit}
                hasPage={data.hasPage}
                payment={data.payment}
                alsoSell={data.alsoSell}
                modules={data.modules}
                missingRates={data.missingRates}
                canNewCourse={data.canNewCourse}
                bookingLink={data.bookingLink}
                shareSetup={data.shareSetup}
            />
        </div>
    );
}
