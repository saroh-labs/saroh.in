import Link from "next/link";
import { visit } from "unist-util-visit";

interface MdastNode {
    type: string;
    url?: string;
    name?: string;
    attributes?: { type: string; name: string; value: string }[];
    children?: MdastNode[];
}

export function replaceLinks({
    href,
    children,
}: {
    href?: string;
    children: React.ReactNode;
}) {
    // this is technically not a remark plugin but it
    // replaces internal links with <Link /> component
    // and external links with <a target="_blank" />
    return href?.startsWith("/") || href === "" ? (
        <Link href={href} className="cursor-pointer">
            {children}
        </Link>
    ) : (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children} ↗
        </a>
    );
}

export function replaceTweets() {
    return (tree: MdastNode) =>
        new Promise<void>((resolve, reject) => {
            const nodesToChange: MdastNode[] = [];

            visit(tree, "link", (node) => {
                const linkNode = node as MdastNode;
                if (
                    linkNode.url !== undefined &&
                    /https?:\/\/twitter\.com\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)([^?])(\?.*)?/g.test(
                        linkNode.url,
                    )
                ) {
                    nodesToChange.push(linkNode);
                }
            });
            for (const node of nodesToChange) {
                try {
                    const regex = /\/status\/(\d+)/gm;
                    const matches = regex.exec(node.url ?? "");

                    if (!matches)
                        throw new Error(
                            `Failed to get tweet: ${node.url ?? "unknown"}`,
                        );

                    const id = matches[1];

                    node.type = "mdxJsxFlowElement";
                    node.name = "Tweet";
                    node.attributes = [
                        {
                            type: "mdxJsxAttribute",
                            name: "id",
                            value: id,
                        },
                    ];
                } catch (e) {
                    console.log("ERROR", e);
                    reject(e instanceof Error ? e : new Error(String(e)));
                    return;
                }
            }

            resolve();
        });
}

// export function replaceExamples(prisma: PrismaClient) {
// 	return (tree: any) =>
// 		new Promise<void>(async (resolve, reject) => {
// 			const nodesToChange = new Array();

// 			visit(tree, "mdxJsxFlowElement", (node: any) => {
// 				if (node.name == "Examples") {
// 					nodesToChange.push({
// 						node,
// 					});
// 				}
// 			});
// 			for (const { node } of nodesToChange) {
// 				try {
// 					const data = await getExamples(node, prisma);
// 					node.attributes = [
// 						{
// 							type: "mdxJsxAttribute",
// 							name: "data",
// 							value: data,
// 						},
// 					];
// 				} catch (e) {
// 					return reject(e);
// 				}
// 			}

// 			resolve();
// 		});
// }

// async function getExamples(node: any, prisma: PrismaClient) {
//   const names = node?.attributes[0].value.split(",");

//   const data = new Array<Example | null>();

//   for (let i = 0; i < names.length; i++) {
//     const results = await prisma.example.findUnique({
//       where: {
//         id: parseInt(names[i]),
//       },
//     });
//     data.push(results);
//   }

//   return JSON.stringify(data);
// }
