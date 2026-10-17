import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMovies, updateMovieAdmin, deleteMovieAdmin, reArchiveMovie, searchTmdbOptions, applyTmdbMatch, autoMatchTmdbBatch } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Pencil, Search, RefreshCw, Target, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/movies")({
  component: MoviesPage,
  head: () => ({ meta: [
    { title: "Movies — CineRadar Admin" },
    { name: "description", content: "Manage indexed movie files and match names with TMDB." },
    { property: "og:title", content: "Movies — CineRadar Admin" },
    { property: "og:description", content: "Manage indexed movie files and match names with TMDB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function MoviesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMovies);
  const upd = useServerFn(updateMovieAdmin);
  const del = useServerFn(deleteMovieAdmin);
  const rearchive = useServerFn(reArchiveMovie);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<any | null>(null);
  const [unmatched, setUnmatched] = useState(false);
  const [matching, setMatching] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "movies", search, offset, unmatched],
    queryFn: () => list({ data: { search, offset, limit: 50, unmatched } }),
  });

  const rows: any[] = data?.rows ?? [];
  const total = data?.total ?? 0;

  const toggleSel = (id: number) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} movies?`)) return;
    await del({ data: { ids: Array.from(selected) } });
    toast.success(`Deleted ${selected.size}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["admin", "movies"] });
  };

  const save = async () => {
    if (!editing) return;
    await upd({ data: { id: editing.id, patch: {
      title: editing.title, language: editing.language, quality: editing.quality,
      year: editing.year ? Number(editing.year) : null, type: editing.type,
    } } });
    toast.success("Saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin", "movies"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">Movies <span className="text-sm font-normal text-muted-foreground">({total})</span></h1>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={bulkDelete}>
            <Trash2 className="h-4 w-4 mr-2" />Delete {selected.size}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search title…" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
        </div>
        <Button size="sm" variant={unmatched ? "default" : "outline"} onClick={() => { setUnmatched(!unmatched); setOffset(0); }}>
          ⚠️ {unmatched ? "Showing unmatched" : "Show unmatched only"}
        </Button>
        <AutoMatchButton onDone={() => qc.invalidateQueries({ queryKey: ["admin", "movies"] })} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 w-8"></th>
              <th className="p-2">ID</th>
              <th className="p-2">Title</th>
              <th className="p-2 hidden md:table-cell">Quality</th>
              <th className="p-2 hidden md:table-cell">Lang</th>
              <th className="p-2 hidden md:table-cell">Year</th>
              <th className="p-2">Storage</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No movies.</td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-2"><Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggleSel(m.id)} /></td>
                <td className="p-2 font-mono text-xs">{m.id}</td>
                <td className="p-2 max-w-[200px]">
                  <div className="truncate">{m.title}</div>
                  {m.tmdb_verified
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" />TMDB</span>
                    : <span className="text-xs text-amber-600">Not matched</span>}
                </td>
                <td className="p-2 hidden md:table-cell">{m.quality ?? "—"}</td>
                <td className="p-2 hidden md:table-cell">{m.language ?? "—"}</td>
                <td className="p-2 hidden md:table-cell">{m.year ?? "—"}</td>
                <td className="p-2">
                  <span className={`inline-flex rounded px-2 py-0.5 text-xs ${m.storage_message_id ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>
                    {m.storage_message_id ? "archived" : "legacy"}
                  </span>
                </td>
                <td className="p-2 text-right">
                  {!m.storage_message_id && (
                    <Button variant="ghost" size="icon" title="Re-archive into storage" onClick={async () => {
                      try { await rearchive({ data: { id: m.id } }); toast.success(`#${m.id} archived`); qc.invalidateQueries({ queryKey: ["admin", "movies"] }); }
                      catch (e) { toast.error((e as Error).message); }
                    }}><RefreshCw className="h-4 w-4" /></Button>
                  )}
                  <Button variant={m.tmdb_verified ? "ghost" : "outline"} size="sm" title="Match name with TMDB" onClick={() => setMatching(m)}>
                    <Target className="h-4 w-4 md:mr-1" /><span className="hidden md:inline">Match</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing({ ...m })}><Pencil className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Prev</Button>
        <span className="text-muted-foreground">{offset + 1}–{Math.min(offset + 50, total)} of {total}</span>
        <Button variant="outline" size="sm" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>Next</Button>
      </div>

      <MatchDialog movie={matching} onClose={() => setMatching(null)} onDone={() => qc.invalidateQueries({ queryKey: ["admin", "movies"] })} />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit movie</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quality</Label><Input value={editing.quality ?? ""} onChange={(e) => setEditing({ ...editing, quality: e.target.value })} /></div>
                <div><Label>Language</Label><Input value={editing.language ?? ""} onChange={(e) => setEditing({ ...editing, language: e.target.value })} /></div>
                <div><Label>Year</Label><Input type="number" value={editing.year ?? ""} onChange={(e) => setEditing({ ...editing, year: e.target.value })} /></div>
                <div><Label>Type</Label><Input value={editing.type ?? ""} onChange={(e) => setEditing({ ...editing, type: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function MatchDialog({ movie, onClose, onDone }: { movie: any | null; onClose: () => void; onDone: () => void }) {
  const searchFn = useServerFn(searchTmdbOptions);
  const applyFn = useServerFn(applyTmdbMatch);
  const [q, setQ] = useState("");
  const [manual, setManual] = useState<string | null>(null);
  const [applying, setApplying] = useState<number | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "tmdb-options", movie?.id, manual],
    queryFn: () => searchFn({ data: manual ? { query: manual } : { movieId: movie.id } }),
    enabled: !!movie,
  });

  const close = () => { setQ(""); setManual(null); onClose(); };

  const apply = async (o: any) => {
    setApplying(o.tmdbId);
    try {
      const r = await applyFn({ data: { id: movie.id, tmdbId: o.tmdbId, kind: o.kind } });
      toast.success(`Matched: ${r.title}${r.year ? ` (${r.year})` : ""}`);
      onDone(); close();
    } catch (e) { toast.error((e as Error).message); }
    finally { setApplying(null); }
  };

  return (
    <Dialog open={!!movie} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Original name match karein</DialogTitle></DialogHeader>
        {movie && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground break-words">Current: <span className="text-foreground">{movie.title}</span></div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) setManual(q.trim()); }}>
              <Input placeholder="Sahi naam type karein (e.g. Jailer)" value={q} onChange={(e) => setQ(e.target.value)} />
              <Button type="submit" disabled={!q.trim()}><Search className="h-4 w-4" /></Button>
            </form>
            {data?.query && <div className="text-xs text-muted-foreground">Results for: “{data.query}”</div>}
            {isFetching && <div className="py-6 text-center text-sm text-muted-foreground">Searching TMDB…</div>}
            {!isFetching && data && data.options.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">Koi match nahi mila — upar sahi naam type karke search karein.</div>
            )}
            {!isFetching && data?.options.map((o: any) => (
              <button key={`${o.kind}-${o.tmdbId}`} disabled={applying !== null} onClick={() => apply(o)}
                className="w-full flex gap-3 rounded-md border p-2 text-left hover:bg-muted/50 disabled:opacity-50">
                {o.poster
                  ? <img src={o.poster} alt={o.title} className="h-20 w-14 rounded object-cover shrink-0" loading="lazy" />
                  : <div className="h-20 w-14 rounded bg-muted shrink-0" />}
                <div className="min-w-0">
                  <div className="font-medium">{o.title} {o.year && <span className="text-muted-foreground">({o.year})</span>}</div>
                  <div className="text-xs text-primary">{o.kind === "TV" ? "Web Series" : "Movie"}{applying === o.tmdbId ? " · Saving…" : ""}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{o.overview}</div>
                </div>
              </button>
            ))}
            <p className="text-xs text-muted-foreground">File aur storage message safe rahenge — sirf naam, saal, poster aur details update honge.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AutoMatchButton({ onDone }: { onDone: () => void }) {
  const run = useServerFn(autoMatchTmdbBatch);
  const [state, setState] = useState<{ running: boolean; done: number; matched: number; skipped: number; remaining: number } | null>(null);
  const stopRef = useRef(false);
  const start = async () => {
    stopRef.current = false;
    let afterId = 0, done = 0, matched = 0, skipped = 0, remaining = 1;
    setState({ running: true, done, matched, skipped, remaining: 0 });
    try {
      while (!stopRef.current && remaining > 0) {
        const r = await run({ data: { afterId, batch: 10 } });
        afterId = r.lastId; done += r.processed; matched += r.matched; skipped += r.skipped; remaining = r.remaining;
        setState({ running: true, done, matched, skipped, remaining });
        if (!r.processed) break;
      }
      toast.success(`Auto-match done: ${matched} matched, ${skipped} need manual check`);
    } catch (e: any) {
      toast.error(e?.message ?? "Auto-match failed");
    } finally {
      setState((s) => (s ? { ...s, running: false } : s));
      onDone();
    }
  };
  const total = state ? state.done + state.remaining : 0;
  const pct = total ? Math.round((state!.done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {state?.running
        ? <Button size="sm" variant="outline" onClick={() => { stopRef.current = true; }}>Stop</Button>
        : <Button size="sm" onClick={start}>⚡ Auto-Match All with TMDB</Button>}
      {state && (
        <div className="text-xs text-muted-foreground min-w-[220px]">
          <div className="h-1.5 w-full rounded bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
          {state.done} / {total} checked · ✅ {state.matched} matched · ⚠️ {state.skipped} manual
        </div>
      )}
    </div>
  );
}
