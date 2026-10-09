import { NotFound } from "@saroh/ui/not-found";

import { PageContainer } from "@/components/shared/page-container";

/** The design's not-found: said plainly, with the way back. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <div className="px-4 pb-10 pt-[50px] sm:px-[26px]">
                <NotFound
                    variant="card"
                    title="This person isn't here"
                    description="They may have been removed, or the link is wrong. Their past orders and bookings are still on record."
                    primary={{ href: "/contacts", label: "Back to Contacts" }}
                />
            </div>
        </PageContainer>
    );
}
