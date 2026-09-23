import { redirect } from "next/navigation";

/**
 * This was a fixed list of Saroh's apps, the same for everyone. "Your
 * businesses" replaced it as the place a person lands; the address is kept so
 * old links and bookmarks still arrive somewhere that is about them.
 */
export default function AppsPage(): never {
    redirect("/businesses");
}
