import { GalleryPage } from "@/components/templates/gallery";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { templatePages } from "@/lib/templates/pages";

const page = pageOf("/templates");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <GalleryPage
            page={page}
            lede="Invoices, quotes and receipts with real example items for your kind of work. Download as PDF, Word, Google Docs or Sheets, or fill one in online."
            pages={templatePages}
        />
    );
}
