import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVerifyStats } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldCheck, MousePointerClick, Download, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/verify")({
  component: VerifyStatsPage,
});

type Stats = Awaited<ReturnType<typeof getVerifyStats>>;

function Stat({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: number;
  icon: any;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value.toLocaleString()}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

function VerifyStatsPage() {
  const load = useServerFn(getVerifyStats);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setBusy(true);
    load()
      .then((r) => setStats(r as Stats))
      .catch(() => setStats(null))
      .finally(() => setBusy(false));
  };

  useEffect(refresh, [load]);

  const rate = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Verification & Revenue</h1>
          <p className="text-sm text-muted-foreground">
            Kitne users verify hue, kitni baar tap hua — daily aur total.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={busy}>
          <RefreshCw className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!stats ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          <div>
            <div className="mb-2 text-sm font-medium">Aaj (today)</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Verified users" value={stats.today.verified} icon={ShieldCheck} />
              <Stat label="Send File taps" value={stats.today.send_tap} icon={MousePointerClick} />
              <Stat label="Verify links shown" value={stats.today.gate_shown} icon={Users} />
              <Stat label="Files delivered" value={stats.today.download} icon={Download} />
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Last 30 days</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Verifications"
                value={stats.last30.verified}
                icon={ShieldCheck}
                hint={`Conversion ${rate(stats.last30.verified, stats.last30.gate_shown)}`}
              />
              <Stat label="Send File taps" value={stats.last30.send_tap} icon={MousePointerClick} />
              <Stat label="Unique users" value={stats.last30.users} icon={Users} />
              <Stat label="Files delivered" value={stats.last30.download} icon={Download} />
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">All time</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Verifications" value={stats.allTime.verified} icon={ShieldCheck} />
              <Stat label="Send File taps" value={stats.allTime.send_tap} icon={MousePointerClick} />
              <Stat label="Verify links shown" value={stats.allTime.gate_shown} icon={Users} />
              <Stat label="Files delivered" value={stats.allTime.download} icon={Download} />
            </div>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Date</th>
                  <th className="p-3">Verified</th>
                  <th className="p-3">Send taps</th>
                  <th className="p-3">Links shown</th>
                  <th className="p-3">Files</th>
                  <th className="p-3">Users</th>
                  <th className="p-3">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {stats.daily.length === 0 ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={7}>
                      Abhi koi data nahi — pehla verify hote hi yahan dikhega.
                    </td>
                  </tr>
                ) : (
                  stats.daily.map((d) => (
                    <tr key={d.day} className="border-b last:border-0">
                      <td className="p-3 font-medium">{d.day}</td>
                      <td className="p-3">{d.verified}</td>
                      <td className="p-3">{d.send_tap}</td>
                      <td className="p-3">{d.gate_shown}</td>
                      <td className="p-3">{d.download}</td>
                      <td className="p-3">{d.users}</td>
                      <td className="p-3">{rate(d.verified, d.gate_shown)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
