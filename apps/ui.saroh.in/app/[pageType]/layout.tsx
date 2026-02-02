import { features } from "@/lib/data/pages";
import React from "react";
import NotFoundPage from "./not-found";

export default async function RenderPageLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ pageType: string }>;
}) {
    const { pageType } = await params;
    const PageLayout = features.find((f) => f.pageType === pageType)?.layout;

    if (!PageLayout) {
        // throw new Error(`No layout found for page type: ${pageType}`);
        return <NotFoundPage />;
    }
    return (
        <PageLayout>
            RenderPageLayout:{pageType}
            {children}
        </PageLayout>
    );
}
