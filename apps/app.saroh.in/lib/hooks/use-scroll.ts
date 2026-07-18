import { useCallback, useSyncExternalStore } from "react";

export default function useScroll(threshold: number) {
    const subscribe = useCallback((onStoreChange: () => void) => {
        window.addEventListener("scroll", onStoreChange);
        return () => window.removeEventListener("scroll", onStoreChange);
    }, []);

    const getSnapshot = useCallback(
        () => window.scrollY > threshold,
        [threshold],
    );

    // Server render (and pre-hydration) reports "not scrolled".
    const getServerSnapshot = useCallback(() => false, []);

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
