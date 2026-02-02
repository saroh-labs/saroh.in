import { useSession } from "next-auth/react";

export default function useCurrentUser() {
    const { data, status } = useSession();
    const user = data?.user;
    if (status === "loading") return { isLoading: true };
    if (status === "authenticated")
        return {
            user,
            isLoading: false,
        };
    if (status === "unauthenticated" || status === "error")
        return { isLoading: true, user: null };

    return { isLoading: true, user: null };
}
