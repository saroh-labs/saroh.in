import BlocksIndex from "@/components/pages/blocks";

export const metadata = {
    title: "Site blocks — saroh/ui",
    description:
        "The blocks a merchant's website is built from, rendered by the same components that serve published sites.",
};

export default function Page() {
    return <BlocksIndex />;
}
