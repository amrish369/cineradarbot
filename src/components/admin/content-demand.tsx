import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRequests } from "@/lib/admin/admin.functions";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Inbox, RefreshCw, Search, TrendingUp } from "lucide-react";

type Period = "today" | "week" | "all";
const periods: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "all", label: "Recent" },
];

export function ContentDemand() {
  const [period, setPeriod] = useState<Period>("week");
  const list = useServerFn(listRequests);
  const requests = useQuery({ queryKey: ["admin", "requests"], queryFn: () => list() });
  const missing = useMemo(() => {
    const now = new Date();
    const cutoff = period === "today"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      : period === "week" ? now.getTime() - 7 * 86400000 : 0;
    const grouped = new Map<string, { title: string; count: number }>();
    for (const row of requests.data?.rows ?? []) {
      if (row.status !== "pending" || new Date(row.created_at).getTime() < cutoff) continue;
      const title = row.title.trim();
      if (!title) continue;
      const key = title.toLocaleLowerCase().replace(/\s+/g, " ");
      const existing = grouped.get(key);
      if (existing) existing.count += 1;
      else grouped.set(key, { title, count: 1 });
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, 10);
  }, [period, requests.data]);

  return (
    <section className="border-y py-6" aria-labelledby="content-demand-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="content-demand-title" className="text-lg font-semibold">Content demand</h2>
          <p className="mt-1 text-xs text-muted-foreground">Pending requests · latest 200 records</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-1" role="group" aria-label="Demand time period">
            {periods.map((item) => (
              <Button key={item.value} size="sm" variant={period === item.value ? "secondary" : "ghost"}
                aria-pressed={period === item.value} onClick={() => setPeriod(item.value)}>{item.label}</Button>
            ))}
          </div>
          <Button size="icon" variant="outline" title="Refresh requests" aria-label="Refresh requests"
            disabled={requests.isFetching} onClick={() => void requests.refetch()}>
            <RefreshCw className={requests.isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b pb-3">
            <TrendingUp className="h-4 w-4 text-chart-2" />
            <h3 className="font-medium">Top searched movies</h3>
            <span className="ml-auto text-xs text-muted-foreground">No data</span>
          </div>
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center">
            <Search className="mb-1 h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">Search statistics unavailable</p>
            <p className="text-xs text-muted-foreground">No recorded search counts.</p>
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b pb-3">
            <Inbox className="h-4 w-4 text-chart-1" />
            <h3 className="font-medium">Missing movies to upload</h3>
            <Button asChild variant="ghost" size="sm" className="ml-auto shrink-0">
              <Link to="/admin/requests" aria-label="View all movie requests"><ArrowUpRight /></Link>
            </Button>
          </div>
          {requests.isPending ? (
            <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading requests…</p>
          ) : requests.isError ? (
            <p role="alert" className="py-12 text-center text-sm text-destructive">Could not load requests. Try refreshing.</p>
          ) : missing.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
              <Inbox className="mb-1 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">No pending requests in this period</p>
            </div>
          ) : (
            <ol className="divide-y">
              {missing.map((item, index) => (
                <li key={item.title} className="flex items-center gap-3 py-3">
                  <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">{item.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.count} {item.count === 1 ? "request" : "requests"}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}