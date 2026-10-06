import { IngestError } from "@/lib/ingest";
import { computeRepositorySummary, type RepoSummary } from "@/lib/metrics";
import { assertKnownRepo, errorResponse, parseTimestamp } from "@/lib/route-helpers";

export const runtime = "nodejs";

const MAX_REPOS = 8;

type RepoSummaryEntry = RepoSummary | { repoId: string; error: string };

// Combined repository-level metrics across one or more repositories. Per-file,
// per-directory and per-author breakdowns stay per repository and are served
// by /api/repos/[id]/metrics.
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const repoIds = [
      ...new Set(
        searchParams
          .getAll("repo")
          .map((repo) => repo.trim())
          .filter((repo) => repo !== ""),
      ),
    ];
    if (repoIds.length === 0) {
      throw new IngestError("Select at least one repository.", 400);
    }
    if (repoIds.length > MAX_REPOS) {
      throw new IngestError(`At most ${MAX_REPOS} repositories can be analyzed at once.`, 400);
    }
    const from = parseTimestamp(searchParams.get("from"), "from");
    const to = parseTimestamp(searchParams.get("to"), "to");

    const repos = await Promise.all(
      repoIds.map(async (repoId): Promise<RepoSummaryEntry> => {
        try {
          await assertKnownRepo(repoId);
          return await computeRepositorySummary(repoId, { from, to });
        } catch (error) {
          if (error instanceof IngestError) {
            return { repoId, error: error.message };
          }
          console.error(`Failed to summarize ${repoId}:`, error);
          return { repoId, error: "Failed to compute metrics for this repository." };
        }
      }),
    );

    const summaries = repos.filter((entry): entry is RepoSummary => !("error" in entry));
    const commitCount = summaries.reduce((total, entry) => total + entry.commitCount, 0);
    const added = summaries.reduce((total, entry) => total + entry.repository.added, 0);
    const removed = summaries.reduce((total, entry) => total + entry.repository.removed, 0);
    const churn = added + removed;

    return Response.json({
      selection: { from: from ?? null, to: to ?? null },
      repos,
      combined: {
        commitCount,
        added,
        removed,
        growth: added - removed,
        churn,
        churnRate: commitCount > 0 ? churn / commitCount : 0,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
