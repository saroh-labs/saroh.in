import { features } from "@/lib/data/pages";
import NotFoundPage from "./not-found";

export default async function FeaturePage({
    params,
}: {
    params: Promise<{
        pageType: string;
    }>;
}) {
    const { pageType } = await params;
    const Page = features.find((f) => f.pageType === pageType)?.component;
    if (!Page) {
        return <NotFoundPage />;
    }
    return (
        <div>
            <Page />
        </div>
    );
}
