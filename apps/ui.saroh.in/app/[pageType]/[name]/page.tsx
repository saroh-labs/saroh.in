export default async function FeatureDetailsPage({
    params,
}: {
    params: Promise<{ name: string; pageType: string }>;
}) {
    const { name, pageType } = await params;
    return (
        <div>
            FeatureDetailsPage{name}, {pageType}
        </div>
    );
}
