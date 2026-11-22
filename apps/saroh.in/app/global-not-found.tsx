import { SiteChrome } from "@/components/shared/layout/site-chrome";

import NotFoundPage, { metadata as notFoundMetadata } from "./(site)/not-found";
import { SarohDocument, sarohMetadata } from "./saroh-document";

export const metadata = { ...sarohMetadata, ...notFoundMetadata };

/**
 * The 404 for an address no route answers (`experimental.globalNotFound`):
 * with each route group its own root layout (KD11) there is no one layout
 * to draw it in, so it brings Saroh's document and the V2 chrome itself.
 */
export default function GlobalNotFound() {
    return (
        <SarohDocument>
            <SiteChrome>
                <NotFoundPage />
            </SiteChrome>
        </SarohDocument>
    );
}
