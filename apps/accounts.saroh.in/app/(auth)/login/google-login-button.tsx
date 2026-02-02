"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SiGoogle } from "react-icons/si";
import LoadingDots from "./loading-dots";
// import { toast } from "sonner";
export default function GoogleLoginButton() {
    const [loading, setLoading] = useState(false);

    // Get error message added by next/auth in URL.
    const searchParams = useSearchParams();
    const error = searchParams?.get("error");

    useEffect(() => {
        const errorMessage = Array.isArray(error) ? error.pop() : error;
        errorMessage;
        // && toast.error(errorMessage);
    }, [error]);

    return (
        <button
            disabled={loading}
            onClick={() => {
                setLoading(true);
                signIn("google");
            }}
            className={`${
                loading
                    ? "cursor-not-allowed bg-stone-50 dark:bg-stone-800"
                    : "bg-white hover:bg-stone-50 active:bg-stone-100 dark:bg-black dark:hover:border-white dark:hover:bg-black"
            } group my-2 flex h-10 w-full items-center justify-center space-x-2 rounded-md border border-stone-200 transition-colors duration-75 focus:outline-none dark:border-stone-700`}
        >
            {loading ? (
                <LoadingDots color="#A8A29E" />
            ) : (
                <>
                    <SiGoogle color="inherit" />
                    <p className="text-sm font-medium text-stone-600 dark:text-stone-400">
                        Login with Google
                    </p>
                </>
            )}
        </button>
    );
}
