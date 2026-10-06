import { ingestFromUrl, ingestFromZip, IngestError, MAX_UPLOAD_BYTES } from "@/lib/ingest";
import { listRepos } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  const repos = await listRepos();
  return Response.json({ repos });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json({ error: "Expected a multipart/form-data request." }, { status: 400 });
    }

    const formData = await request.formData();
    const urlField = formData.get("url");
    const fileField = formData.get("file");

    if (typeof urlField === "string" && urlField.trim()) {
      const repository = await ingestFromUrl(urlField);
      return Response.json({ repository }, { status: 201 });
    }

    if (fileField instanceof File && fileField.size > 0) {
      if (fileField.size > MAX_UPLOAD_BYTES) {
        const limitMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
        return Response.json(
          { error: `The archive exceeds the ${limitMb} MB upload limit.` },
          { status: 413 },
        );
      }
      const data = Buffer.from(await fileField.arrayBuffer());
      const repository = await ingestFromZip(fileField.name || "repository.zip", data);
      return Response.json({ repository }, { status: 201 });
    }

    return Response.json({ error: "Provide a repository URL or a .zip file." }, { status: 400 });
  } catch (error) {
    if (error instanceof IngestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Repository ingestion failed:", error);
    return Response.json({ error: "Unexpected error while adding the repository." }, { status: 500 });
  }
}
