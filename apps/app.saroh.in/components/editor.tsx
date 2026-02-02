"use client";

import { updatePost, updatePostMetadata } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Post } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import {
    EditorCommand,
    EditorCommandEmpty,
    EditorCommandItem,
    EditorContent,
    EditorRoot,
} from "novel";
import { handleCommandNavigation } from "novel/extensions";
import { useEffect, useState, useTransition } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";
import { defaultExtensions } from "./editor/extensions";
import { slashCommand, suggestionItems } from "./editor/slashCommand";
import LoadingDots from "./icons/loading-dots";

type PostWithSite = Post & { site: { subdomain: string | null } | null };

const extensions = [...defaultExtensions, slashCommand];
export default function Editor({ post }: { post: PostWithSite }) {
    let [isPendingSaving, startTransitionSaving] = useTransition();
    let [isPendingPublishing, startTransitionPublishing] = useTransition();
    const [data, setData] = useState<PostWithSite>(post);
    const [hydrated, setHydrated] = useState(false);

    const url = process.env.NEXT_PUBLIC_VERCEL_ENV
        ? `https://${data.site?.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}/${data.slug}`
        : `http://${data.site?.subdomain}.localhost:3000/${data.slug}`;

    // listen to CMD + S and override the default behavior
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.metaKey && e.key === "s") {
                e.preventDefault();
                startTransitionSaving(async () => {
                    await updatePost(data);
                });
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [data, startTransitionSaving]);

    return (
        <div className="relative min-h-[500px] w-full max-w-screen-lg border-stone-200 p-12 px-8 sm:mb-[calc(20vh)] sm:rounded-lg sm:border sm:px-12 sm:shadow-lg dark:border-stone-700">
            <div className="absolute right-5 top-5 mb-5 flex items-center space-x-3">
                {data.published && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 text-sm text-stone-400 hover:text-stone-500"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </a>
                )}
                <div className="rounded-lg bg-stone-100 px-2 py-1 text-sm text-stone-400 dark:bg-stone-800 dark:text-stone-500">
                    {isPendingSaving ? "Saving..." : "Saved"}
                </div>
                <button
                    onClick={() => {
                        const formData = new FormData();
                        console.log(data.published, typeof data.published);
                        formData.append("published", String(!data.published));
                        startTransitionPublishing(async () => {
                            await updatePostMetadata(
                                formData,
                                post.id,
                                "published",
                            ).then(() => {
                                toast.success(
                                    `Successfully ${
                                        data.published
                                            ? "unpublished"
                                            : "published"
                                    } your post.`,
                                );
                                setData((prev) => ({
                                    ...prev,
                                    published: !prev.published,
                                }));
                            });
                        });
                    }}
                    className={cn(
                        "flex h-7 w-24 items-center justify-center space-x-2 rounded-lg border text-sm transition-all focus:outline-none",
                        isPendingPublishing
                            ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                            : "border border-black bg-black text-white hover:bg-white hover:text-black active:bg-stone-100 dark:border-stone-700 dark:hover:border-stone-200 dark:hover:bg-black dark:hover:text-white dark:active:bg-stone-800",
                    )}
                    disabled={isPendingPublishing}
                >
                    {isPendingPublishing ? (
                        <LoadingDots />
                    ) : (
                        <p>{data.published ? "Unpublish" : "Publish"}</p>
                    )}
                </button>
            </div>
            <div className="mb-5 flex flex-col space-y-3 border-b border-stone-200 pb-5 dark:border-stone-700">
                <input
                    type="text"
                    placeholder="Title"
                    defaultValue={post?.title || ""}
                    autoFocus
                    onChange={(e) =>
                        setData({ ...data, title: e.target.value })
                    }
                    className="dark:placeholder-text-600 font-cal border-none px-0 text-3xl placeholder:text-stone-400 focus:outline-none focus:ring-0 dark:bg-black dark:text-white"
                />
                <TextareaAutosize
                    placeholder="Description"
                    defaultValue={post?.description || ""}
                    onChange={(e) =>
                        setData({ ...data, description: e.target.value })
                    }
                    className="dark:placeholder-text-600 w-full resize-none border-none px-0 placeholder:text-stone-400 focus:outline-none focus:ring-0 dark:bg-black dark:text-white"
                />
            </div>
            <EditorRoot>
                <EditorContent
                    extensions={extensions}
                    // enableCoreExtensions
                    initialContent={(post?.content as unknown) || ""}
                    onUpdate={(editor) => {
                        setData((prev) => ({
                            ...prev,
                            content:
                                editor.editor.storage.markdown.getMarkdown(),
                        }));
                    }}
                    editorProps={{
                        // ...defaultEditorProps,
                        handleDOMEvents: {
                            keydown: (_view, event) =>
                                handleCommandNavigation(event),
                        },
                        attributes: {
                            class: `prose prose-stone m-auto w-11/12 dark:prose-invert sm:prose-lg sm:w-3/4 focus-visible:outline-none focus-visible:border-none focus-visible:ring-0`,
                        },
                    }}
                    className="border-none focus:outline-none focus:ring-0 dark:bg-black dark:text-white"
                >
                    <EditorCommand className="border-muted bg-background z-50  h-auto max-h-[330px] w-72 overflow-y-auto rounded-md border px-1 py-2 shadow-md transition-all">
                        <EditorCommandEmpty className="text-muted-foreground px-2">
                            No results
                        </EditorCommandEmpty>
                        {suggestionItems.map((item) => (
                            <EditorCommandItem
                                value={item.title}
                                // onCommand={(val) => item?.command(val)}
                                onCommand={(val) =>
                                    typeof item?.command === "function" &&
                                    item.command(val)
                                }
                                className={`hover:bg-accent aria-selected:bg-accent flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm `}
                                key={item.title}
                            >
                                <div className="border-muted bg-background flex h-10 w-10 items-center justify-center rounded-md border">
                                    {item.icon}
                                </div>
                                <div>
                                    <p className="font-medium">{item.title}</p>
                                    <p className="text-muted-foreground text-xs">
                                        {item.description}
                                    </p>
                                </div>
                            </EditorCommandItem>
                        ))}
                    </EditorCommand>
                </EditorContent>
                {/* <EditorCommand className="z-50 h-auto max-h-[330px]  w-72 overflow-y-auto rounded-md border border-muted bg-background px-1 py-2 shadow-md transition-all">
						<EditorCommandEmpty className="px-2 text-muted-foreground">
							No results
						</EditorCommandEmpty>
						{suggestionItems.map((item) => (
							<EditorCommandItem
								value={item.title}
								onCommand={(val) => item?.command(val)}
								className={`flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent aria-selected:bg-accent `}
								key={item.title}
							>
								<div className="flex h-10 w-10 items-center justify-center rounded-md border border-muted bg-background">
									{item.icon}
								</div>
								<div>
									<p className="font-medium">{item.title}</p>
									<p className="text-xs text-muted-foreground">
										{item.description}
									</p>
								</div>
							</EditorCommandItem>
						))}
					</EditorCommand>
				</EditorContent> */}
                {/* <EditorContent
					className="relative block"
					defaultValue={post?.content || ""}
					onUpdate={(editor) => {
						setData((prev) => ({
							...prev,
							content: editor?.storage.markdown.getMarkdown(),
						}));
					}}
					onDebouncedUpdate={() => {
						if (
							data.title === post.title &&
							data.description === post.description &&
							data.content === post.content
						) {
							return;
						}
						startTransitionSaving(async () => {
							await updatePost(data);
						});
					}}
				/> */}
            </EditorRoot>
        </div>
    );
}
