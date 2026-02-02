import { MovingBorderButton } from "../ui/moving-borders";
import { Spotlight } from "../ui/spotlight";

export function SpotlightPreview() {
    return (
        <div className="bg-grid-white/[0.02] relative flex h-[40rem] w-full overflow-hidden rounded-md bg-black/[0.96] antialiased md:items-center md:justify-center">
            <Spotlight
                className="-top-40 left-0 md:-top-20 md:left-60"
                fill="white"
            />
            <div className=" relative z-10 mx-auto  w-full pt-20 md:pt-0">
                <span
                    // href={`/${latestPost._raw.sourceFileDir}/${latestPost.slug}`}
                    className="group mx-auto flex max-w-fit items-center justify-center space-x-2 overflow-hidden rounded-full border border-gray-200 bg-white px-7 py-2 shadow-[inset_10px_-50px_94px_0_rgb(199,199,199,0.1)] backdrop-blur transition-all hover:border-gray-300 hover:bg-white/50 "
                >
                    <p className="text-sm font-semibold text-gray-700">
                        {/* {latestPost.title} */}
                        Introducing Saroh - a new way to manage your online
                        storefronts.
                    </p>
                    {/* <ExpandingArrow className="-ml-1 h-3.5 w-3.5" /> */}
                </span>

                <h1 className="mt-8 bg-opacity-50 bg-gradient-to-b from-neutral-50 to-neutral-400 bg-clip-text text-center text-4xl font-bold text-transparent md:text-7xl">
                    Storefronts With
                    <br /> Superpowers
                </h1>
                <p className="mx-auto mt-4 max-w-lg text-center text-base font-normal text-neutral-300">
                    Saroh is an open-source storefront management tool for
                    businesses to create, share, and track their online
                    business.
                </p>
                <div className="mx-auto mt-10 flex max-w-fit space-x-4">
                    <MovingBorderButton>
                        <a href={`${process.env.NEXT_PUBLIC_AUTH_APP_URL}`}>
                            Create Account
                        </a>{" "}
                    </MovingBorderButton>
                </div>
            </div>
        </div>
    );
}
