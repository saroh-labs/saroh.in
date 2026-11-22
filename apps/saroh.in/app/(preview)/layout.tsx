import { SarohDocument, sarohMetadata } from "../saroh-document";

export const metadata = sarohMetadata;

/** Saroh's document, as a root layout (`saroh-document.tsx`); the pages draw their own chrome. */
export default function Layout({ children }: { children: React.ReactNode }) {
    return <SarohDocument>{children}</SarohDocument>;
}
