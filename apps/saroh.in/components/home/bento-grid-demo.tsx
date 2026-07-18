"use client";
import { cn } from "@/lib/utils";
import {
    IconBoxAlignRightFilled,
    IconBrandGithub,
    IconBrandInstagram,
    IconBrandStripe,
    IconClipboardCopy,
    IconFileBroken,
    IconSignature,
    IconTableColumn,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import React from "react";
import { BentoGrid, BentoGridItem } from "../ui/bento-grid";

export function BentoGridThirdDemo() {
    return (
        <div className="my-16 space-y-8">
            <h1 className="py-8 text-center text-7xl font-semibold">
                Features
            </h1>
            <BentoGrid className="mx-auto max-w-4xl md:auto-rows-[20rem]">
                {items.map((item, i) => (
                    <BentoGridItem
                        key={i}
                        title={item.title}
                        description={item.description}
                        header={item.header}
                        className={cn("[&>p:text-lg]", item.className)}
                        icon={item.icon}
                    />
                ))}
            </BentoGrid>
        </div>
    );
}
// Kept at module scope so the random value is generated outside of render.
const createRandomWidth = () => Math.random() * (100 - 40) + 40;

const SkeletonOne = () => {
    const variants = {
        initial: {
            x: 0,
        },
        animate: {
            x: 10,
            rotate: 5,
            transition: {
                duration: 0.2,
            },
        },
    };
    const variantsSecond = {
        initial: {
            x: 0,
        },
        animate: {
            x: -10,
            rotate: -5,
            transition: {
                duration: 0.2,
            },
        },
    };

    return (
        <motion.div
            initial="initial"
            whileHover="animate"
            className="flex h-full min-h-[6rem] w-full flex-1 flex-col space-y-2 bg-dot-black/[0.2] dark:bg-dot-white/[0.2]"
        >
            <motion.div
                variants={variants}
                className="flex flex-row items-center space-x-2 rounded-full border border-neutral-100 bg-white p-2 dark:border-white/[0.2] dark:bg-black"
            >
                <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-violet-500" />
                <div className="h-4 w-full rounded-full bg-gray-100 dark:bg-neutral-900" />
            </motion.div>
            <motion.div
                variants={variantsSecond}
                className="ml-auto flex w-3/4 flex-row items-center space-x-2 rounded-full border border-neutral-100 bg-white p-2 dark:border-white/[0.2] dark:bg-black"
            >
                <div className="h-4 w-full rounded-full bg-gray-100 dark:bg-neutral-900" />
                <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-violet-500" />
            </motion.div>
            <motion.div
                variants={variants}
                className="flex flex-row items-center space-x-2 rounded-full border border-neutral-100 bg-white p-2 dark:border-white/[0.2] dark:bg-black"
            >
                <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-violet-500" />
                <div className="h-4 w-full rounded-full bg-gray-100 dark:bg-neutral-900" />
            </motion.div>
        </motion.div>
    );
};
const SkeletonTwo = () => {
    const variants = {
        initial: {
            width: 0,
        },
        animate: {
            width: "100%",
            transition: {
                duration: 0.2,
            },
        },
        hover: {
            width: ["0%", "100%"],
            transition: {
                duration: 2,
            },
        },
    };
    const arr = new Array(6).fill(0);
    // Generate the random bar widths once (lazy state init) so the render
    // stays pure and the widths remain stable across re-renders.
    const [widths] = React.useState(() =>
        Array.from({ length: 6 }, () => createRandomWidth()),
    );
    return (
        <motion.div
            initial="initial"
            animate="animate"
            whileHover="hover"
            className="flex h-full min-h-[6rem] w-full flex-1 flex-col space-y-2 bg-dot-black/[0.2] dark:bg-dot-white/[0.2]"
        >
            {arr.map((_, i) => (
                <motion.div
                    key={"skelenton-two" + i}
                    variants={variants}
                    style={{
                        maxWidth: widths[i] + "%",
                    }}
                    className="flex h-4 w-full flex-row items-center space-x-2 rounded-full border border-neutral-100 bg-neutral-100 p-2 dark:border-white/[0.2] dark:bg-black"
                ></motion.div>
            ))}
        </motion.div>
    );
};
const SkeletonThree = () => {
    const variants = {
        initial: {
            backgroundPosition: "0 50%",
        },
        animate: {
            backgroundPosition: ["0, 50%", "100% 50%", "0 50%"],
        },
    };
    return (
        <motion.div
            initial="initial"
            animate="animate"
            variants={variants}
            transition={{
                duration: 5,
                repeat: Infinity,
                repeatType: "reverse",
            }}
            className="flex h-full min-h-[6rem] w-full flex-1 flex-col space-y-2 rounded-lg bg-dot-black/[0.2] dark:bg-dot-white/[0.2]"
            style={{
                background:
                    "linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)",
                backgroundSize: "400% 400%",
            }}
        >
            <motion.div className="h-full w-full rounded-lg"></motion.div>
        </motion.div>
    );
};
const SkeletonFour = () => {
    const first = {
        initial: {
            x: 20,
            rotate: -5,
        },
        hover: {
            x: 0,
            rotate: 0,
        },
    };
    const second = {
        initial: {
            x: -20,
            rotate: 5,
        },
        hover: {
            x: 0,
            rotate: 0,
        },
    };
    return (
        <motion.div
            initial="initial"
            animate="animate"
            whileHover="hover"
            className="flex h-full min-h-[6rem] w-full flex-1 flex-row space-x-2 bg-dot-black/[0.2] dark:bg-dot-white/[0.2]"
        >
            <motion.div
                variants={first}
                className="flex h-full w-1/3 flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.1] dark:bg-black"
            >
                {/* <Image
					src="https://pbs.twimg.com/profile_images/1417752099488636931/cs2R59eW_400x400.jpg"
					alt="avatar"
					height="100"
					width="100"
					className="rounded-full h-10 w-10"
				/> */}
                {/* <Avatar> */}
                <IconBrandInstagram />
                {/* </Avatar> */}

                <p className="mt-4 text-center text-xs font-semibold text-neutral-500 sm:text-sm">
                    Social Media Integrations
                </p>
                <p className="mt-4 rounded-full border border-red-500 bg-red-100 px-2 py-0.5 text-xs text-red-600 dark:bg-red-900/20">
                    #saroh
                </p>
            </motion.div>
            <motion.div className="relative z-20 flex h-full w-1/3 flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.1] dark:bg-black">
                {/* <Image
					src="https://pbs.twimg.com/profile_images/1417752099488636931/cs2R59eW_400x400.jpg"
					alt="avatar"
					height="100"
					width="100"
					className="rounded-full h-10 w-10"
				/> */}
                <IconBrandStripe />

                <p className="mt-4 text-center text-xs font-semibold text-neutral-500 sm:text-sm">
                    Payment Provider Integration
                </p>
                <p className="mt-4 rounded-full border border-green-500 bg-green-100 px-2 py-0.5 text-xs text-green-600 dark:bg-green-900/20">
                    Monetization
                </p>
            </motion.div>
            <motion.div
                variants={second}
                className="flex h-full w-1/3 flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.1] dark:bg-black"
            >
                {/* <Image
					src="https://pbs.twimg.com/profile_images/1417752099488636931/cs2R59eW_400x400.jpg"
					alt="avatar"
					height="100"
					width="100"
					className="rounded-full h-10 w-10"
				/> */}
                <IconBrandGithub />

                <p className="mt-4 text-center text-xs font-semibold text-neutral-500 sm:text-sm">
                    Productivity and other tools
                </p>
                <p className="mt-4 rounded-full border border-orange-500 bg-orange-100 px-2 py-0.5 text-xs text-orange-600 dark:bg-orange-900/20">
                    Organize
                </p>
            </motion.div>
        </motion.div>
    );
};
const SkeletonFive = () => {
    const variants = {
        initial: {
            x: 0,
        },
        animate: {
            x: 10,
            rotate: 5,
            transition: {
                duration: 0.2,
            },
        },
    };
    const variantsSecond = {
        initial: {
            x: 0,
        },
        animate: {
            x: -10,
            rotate: -5,
            transition: {
                duration: 0.2,
            },
        },
    };

    return (
        <motion.div
            initial="initial"
            whileHover="animate"
            className="flex h-full min-h-[6rem] w-full flex-1 flex-col space-y-2 bg-dot-black/[0.2] dark:bg-dot-white/[0.2]"
        >
            <motion.div
                variants={variants}
                className="flex flex-row items-start space-x-2 rounded-2xl border border-neutral-100 bg-white p-2 dark:border-white/[0.2] dark:bg-black"
            >
                {/* <Image
					src="https://pbs.twimg.com/profile_images/1417752099488636931/cs2R59eW_400x400.jpg"
					alt="avatar"
					height="100"
					width="100"
					className="rounded-full h-10 w-10"
				/> */}
                {/* <p className="text-xs text-neutral-500">
					There are a lot of cool framerworks out there like React,
					Angular, Vue, Svelte that can make your life ....
				</p> */}
            </motion.div>
            <motion.div
                variants={variantsSecond}
                className="ml-auto flex w-3/4 flex-row items-center justify-end space-x-2 rounded-full border border-neutral-100 bg-white p-2 dark:border-white/[0.2] dark:bg-black"
            >
                {/* <p className="text-xs text-neutral-500">Use PHP.</p> */}
                <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-violet-500" />
            </motion.div>
        </motion.div>
    );
};
const items = [
    {
        title: "AI Content Generation",
        description: (
            <span className="text-sm">
                Experience the power of AI in generating unique content.
            </span>
        ),
        header: <SkeletonOne />,
        className: "md:col-span-1",
        icon: <IconClipboardCopy className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Web Analytics",
        description: (
            <span className="text-sm">
                Get insights into your website&apos;s performance with our
                analytics
            </span>
        ),
        header: <SkeletonTwo />,
        className: "md:col-span-1",
        icon: <IconFileBroken className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Custom Domain",
        description: (
            <span className="text-sm">
                Add custom domain to your website and make it your own.
            </span>
        ),
        header: <SkeletonThree />,
        className: "md:col-span-1",
        icon: <IconSignature className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Third-party integrations",
        description: (
            <span className="text-sm">
                Integrate your favorite tools and services with Saroh.
            </span>
        ),
        header: <SkeletonFour />,
        className: "md:col-span-2",
        icon: <IconTableColumn className="h-4 w-4 text-neutral-500" />,
    },

    {
        title: "Drag and Drop Builder",
        description: (
            <span className="text-sm">
                Build your website with our intuitive drag and drop builder.
            </span>
        ),
        header: <SkeletonFive />,
        className: "md:col-span-1",
        icon: <IconBoxAlignRightFilled className="h-4 w-4 text-neutral-500" />,
    },
];
