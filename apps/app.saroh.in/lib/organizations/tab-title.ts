import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { titleTemplate } from "@/lib/page-title";

import { activeOrganizationOnce } from "./service";

/**
 * A layout's metadata inside a business: the title template that puts the
 * business's name in every tab under it (`lib/page-title.ts`).
 *
 * The business is the one the shell resolves, from the same request-cached
 * read, so this adds no call to the API. With no business (first run, a
 * session that ended) or a read that failed it returns nothing, and the root
 * layout's "%s · Saroh" stands: a title never stops a page.
 */
export async function activeBusinessTitle(): Promise<Metadata> {
    try {
        const title = titleTemplate((await activeOrganizationOnce())?.name);
        return title ? { title } : {};
    } catch (error) {
        unstable_rethrow(error);
        return {};
    }
}
