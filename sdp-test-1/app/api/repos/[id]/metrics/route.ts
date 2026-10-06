import { IngestError } from "@/lib/ingest";
import { computeMetrics, type MetricsOptions } from "@/lib/metrics";
import { assertKnownRepo, errorResponse, parseTimestamp } from "@/lib/route-helpers";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/repos/[id]/metrics">) {
  try {
    const { id } = await context.params;
    await assertKnownRepo(id);
    const searchParams = new URL(request.url).searchParams;
    const options = parseMetricsQuery(searchParams);
    return Response.json(await computeMetrics(id, options));
  } catch (error) {
    return errorResponse(error);
  }
}

function parseMetricsQuery(searchParams: URLSearchParams): MetricsOptions {
  const ref = searchParams.get("ref")?.trim() || undefined;
  const from = parseTimestamp(searchParams.get("from"), "from");
  const to = parseTimestamp(searchParams.get("to"), "to");

  let hashes: string[] | undefined;
  const commitsParam = searchParams.get("commits");
  if (commitsParam !== null) {
    hashes = commitsParam
      .split(",")
      .map((hash) => hash.trim())
      .filter((hash) => hash !== "");
    if (hashes.length === 0) {
      throw new IngestError("The commits parameter must list at least one commit hash.", 400);
    }
    for (const hash of hashes) {
      if (!/^[0-9a-fA-F]{4,64}$/.test(hash)) {
        throw new IngestError(
          `"${hash}" is not a valid commit hash.`,
          400,
        );
      }
    }
  }

  const object = searchParams.has("object") ? searchParams.get("object") ?? "" : undefined;

  const authors = searchParams
    .getAll("author")
    .map((author) => author.trim())
    .filter((author) => author !== "");
  if (authors.length > 50) {
    throw new IngestError("At most 50 author filters are supported.", 400);
  }
  for (const author of authors) {
    if (author.length > 120) {
      throw new IngestError("Author filter names must be 120 characters or fewer.", 400);
    }
  }

  const path = parsePathFilter(searchParams.get("path"));

  return { ref, from, to, hashes, authors: authors.length > 0 ? authors : undefined, path, object };
}

function parsePathFilter(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  let path = value.trim().replace(/^\.\//, "");
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "") {
    return undefined;
  }
  if (path.length > 300) {
    throw new IngestError("The path filter must be 300 characters or fewer.", 400);
  }
  return path;
}
