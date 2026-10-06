import { IngestError } from "@/lib/ingest";
import { buildAuthorResolver, loadCommitDataset } from "@/lib/metrics";
import { assertKnownRepo, errorResponse } from "@/lib/route-helpers";
import { loadMerges } from "@/lib/authors";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request, context: RouteContext<"/api/repos/[id]/commits">) {
  try {
    const { id } = await context.params;
    await assertKnownRepo(id);
    const limit = parseLimit(new URL(request.url).searchParams.get("limit"));

    const dataset = await loadCommitDataset(id, "HEAD");
    const merges = await loadMerges(id);
    const resolveAuthor = buildAuthorResolver(merges);

    const commits = dataset.commits.slice(0, limit).map((commit) => {
      const identity = resolveAuthor(commit.author, commit.email);
      return {
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        author: identity.name,
        timestamp: commit.timestamp,
        subject: commit.subject,
      };
    });

    return Response.json({
      repoId: id,
      ref: dataset.ref,
      total: dataset.commitCount,
      commits,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseLimit(value: string | null): number {
  if (value === null || value.trim() === "") {
    return DEFAULT_LIMIT;
  }
  if (!/^\d{1,4}$/.test(value.trim())) {
    throw new IngestError("The limit parameter must be a positive integer.", 400);
  }
  const limit = Number.parseInt(value.trim(), 10);
  if (limit < 1) {
    throw new IngestError("The limit parameter must be a positive integer.", 400);
  }
  return Math.min(limit, MAX_LIMIT);
}
