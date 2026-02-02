// import {
//     defaultBlockSchema,
//     defaultBlockSpecs,
//     defaultProps,
//   } from "@blocknote/core";
//   import {
//     BlockNoteView,
//     useBlockNote,
//     createReactBlockSpec,
//     ReactSlashMenuItem,
//     getDefaultReactSlashMenuItems,
//   } from "@blocknote/react";
//   import "@blocknote/react/style.css";
//   import { RiText } from "react-icons/ri";

//   export default function BlocknoteTextEditor() {
//     // Creates a paragraph block with custom font.
//     const FontParagraphBlock = createReactBlockSpec(
//       {
//         type: "fontParagraph",
//         propSchema: {
//           ...defaultProps,
//           font: {
//             default: "Comic Sans MS",
//           },
//         },
//         content: "inline",
//       },
//       {
//         render: ({ block, contentRef }) => {
//           const style = {
//             fontFamily: block.props.font
//           };

//           return (
//             <p ref={contentRef} style={style} />
//           );
//         },
//         toExternalHTML: ({ contentRef }) => <p ref={contentRef} />,
//         parse: (element) => {
//           const font = element.style.fontFamily;

//           if (font === "") {
//             return;
//           }

//           return {
//             font: font || undefined,
//           };
//         },
//       }
//     );

//     // Our block schema, which contains the configs for blocks that we want our
//     // editor to use.
//     const blockSchema = {
//       // Adds all default blocks.
//       ...defaultBlockSchema,
//       // Adds the font paragraph.
//       fontParagraph: FontParagraphBlock.config,
//     };
//     // Our block specs, which contain the configs and implementations for blocks
//     // that we want our editor to use.
//     const blockSpecs = {
//       // Adds all default blocks.
//       ...defaultBlockSpecs,
//       // Adds the font paragraph.
//       fontParagraph: FontParagraphBlock,
//     };

//     // Creates a slash menu item for inserting a font paragraph block.
//     const insertFontParagraph: ReactSlashMenuItem<typeof blockSchema> = {
//       name: "Insert Font Paragraph",
//       execute: (editor) => {
//         const font = prompt("Enter font name");

//         editor.insertBlocks(
//           [
//             {
//               type: "fontParagraph",
//               props: {
//                 font: font || undefined,
//               },
//             },
//           ],
//           editor.getTextCursorPosition().block,
//           "after"
//         );
//       },
//       aliases: ["p", "paragraph", "font"],
//       group: "Other",
//       icon: <RiText />,
//     };

//     // Creates a new editor instance.
//     const editor = useBlockNote({
//       // Tells BlockNote which blocks to use.
//       blockSpecs: blockSpecs,
//       slashMenuItems: [
//         ...getDefaultReactSlashMenuItems(blockSchema),
//         insertFontParagraph,
//       ],
//     });

//     // Renders the editor instance using a React component.
//     return <BlockNoteView editor={editor} theme={"dark"} />;
//   }
