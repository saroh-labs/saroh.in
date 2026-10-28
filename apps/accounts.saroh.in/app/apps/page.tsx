import { redirect } from "next/navigation";

import { consoleUrl } from "@/lib/businesses";

/**
 * Saroh's apps moved to the console (DEC-199), where only staff are. The
 * old address goes there; the console decides who may see it.
 */
export default function AppsPage() {
    redirect(`${consoleUrl()}/apps`);
}
