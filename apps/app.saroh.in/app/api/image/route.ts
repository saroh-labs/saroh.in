// app/upload/route.ts
import { S3, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { File } from "buffer";
import { NextResponse } from "next/server";

const endpoint = process.env.SPACES_ENDPOINT!;
const region = process.env.SPACES_REGION!;
const credentials = {
	accessKeyId: process.env.SPACES_KEY!,
	secretAccessKey: process.env.SPACES_SECRET!,
};
const spaceName = process.env.SPACES_NAME!;
const CDN_BASE_URL = `https://${process.env.SPACES_IMAGES_CDN_BASE_URL!}`;
const FOLDER = process.env.SPACES_FOLDER!;
const s3Client = new S3({
	forcePathStyle: false,
	endpoint: endpoint,
	region: region,
	credentials: credentials,
});

export async function POST(req: Request) {
	try {
		const form = await req.formData();
		const file = form.get("file-input");

		if (!file) return NextResponse.json({ message: "failure" });

		const isFile = file instanceof File;

		if (!isFile) return NextResponse.json({ message: "failure" });

		const buffer = await file.arrayBuffer();

		const data = await s3Client.send(
			new PutObjectCommand({
				Bucket: spaceName,
				Key: `${FOLDER}/${file.name}`,
				Body: Buffer.from(buffer),
				ACL: "public-read-write",
				ContentType: file.type,
			}),
		);

		console.log(data);
		return NextResponse.json({
			message: "success",
			data,
			file_path: `${CDN_BASE_URL}/${FOLDER}/${file.name}`,
		});
	} catch (reason) {
		console.log(reason);
		return NextResponse.json({ message: "failure", reason });
	}
}

export async function DELETE(req: Request) {
	try {
		const { file } = await req.json();
		const fileName = file.split(`${CDN_BASE_URL}/`)[1];
		const data = await s3Client.send(
			new DeleteObjectCommand({
				Bucket: `${process.env.SPACES_NAME}`,
				Key: `/${fileName}`,
			}),
		);

		return NextResponse.json({ message: "success", data });
	} catch (reason) {
		console.log(reason);
		return NextResponse.json({ message: "failure", reason });
	}
}
