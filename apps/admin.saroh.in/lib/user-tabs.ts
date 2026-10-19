/** The user page's tabs (admin console U9, R13). Client-safe. */

export const USER_TABS = [
    { value: "overview", label: "Overview" },
    { value: "businesses", label: "Businesses" },
    { value: "sign-in", label: "Sign-in" },
    { value: "history", label: "History" },
] as const;

export type UserTab = (typeof USER_TABS)[number]["value"];

/** Which tab an address is, under the user's own address `base`. */
export function userTabOf(pathname: string, base: string): UserTab {
    const rest = pathname.startsWith(base)
        ? pathname.slice(base.length).replace(/^\/+/, "").split("/")[0]
        : "";
    const found = USER_TABS.find((tab) => tab.value === rest);
    return found ? found.value : "overview";
}
