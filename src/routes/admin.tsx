import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { marketsQuery } from "./index";
import { resultLabel } from "@/lib/matka";
import { AdminPlays } from "@/components/AdminPlays";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — PlayOn" },
      { name: "description", content: "Manage markets and declare results." },
      { property: "og:title", content: "Admin — PlayOn" },
      { property: "og:description", content: "PlayOn admin panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile(user?.id);
  const { data: markets } = useQuery(marketsQuery);
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", open_time: "10:00", close_time: "11:00" });
  const [pannas, setPannas] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, { open_time: string; close_time: string }>>({});

  const refresh = () => qc.invalidateQueries({ queryKey: ["markets"] });
  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p;
    if (error) { toast.error(error.message); return; }
    toast.success(ok);
    refresh();
  };

  if (isLoading) return null;
  if (!profile?.isAdmin) return <main className="p-8 text-center text-muted-foreground">Admins only.</main>;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="font-display text-4xl tracking-wide text-gold">Admin Panel</h1>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4"
        onSubmit={(e) => { e.preventDefault(); run(supabase.from("markets").insert({ ...form, sort_order: (markets?.length ?? 0) + 1 }), "Market added"); setForm({ ...form, name: "" }); }}>
        <Input placeholder="Market name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="max-w-xs" />
        <Input type="time" value={form.open_time} onChange={(e) => setForm({ ...form, open_time: e.target.value })} className="w-32" />
        <Input type="time" value={form.close_time} onChange={(e) => setForm({ ...form, close_time: e.target.value })} className="w-32" />
        <Button>Add market</Button>
      </form>

      {markets?.map((m) => {
        const session = m.open_panna ? "close" : "open";
        return (
          <div key={m.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl tracking-wide">{m.name}</h2>
              <span className="font-display text-xl tracking-widest text-primary">{resultLabel(m.open_panna, m.close_panna)}</span>
              <label className="ml-auto flex items-center gap-2 text-sm">
                Active <Switch checked={m.active} onCheckedChange={(v) => run(supabase.from("markets").update({ active: v }).eq("id", m.id), "Updated")} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input type="time" className="w-32" title="Open time"
                value={times[m.id]?.open_time ?? m.open_time}
                onChange={(e) => {
                  const cur = times[m.id] ?? { open_time: m.open_time, close_time: m.close_time };
                  setTimes({ ...times, [m.id]: { ...cur, open_time: e.target.value } });
                }} />
              <Input type="time" className="w-32" title="Close time"
                value={times[m.id]?.close_time ?? m.close_time}
                onChange={(e) => {
                  const cur = times[m.id] ?? { open_time: m.open_time, close_time: m.close_time };
                  setTimes({ ...times, [m.id]: { ...cur, close_time: e.target.value } });
                }} />
              <Button size="sm" variant="secondary" onClick={() => { const t = times[m.id]; if (t) run(supabase.from("markets").update(t).eq("id", m.id), "Times updated"); }}>
                Save times
              </Button>
              {!m.close_panna && (
                <>
                  <Input placeholder={`${session} panna e.g. 123`} maxLength={3} className="w-48"
                    value={pannas[m.id] ?? ""} onChange={(e) => setPannas({ ...pannas, [m.id]: e.target.value.replace(/\D/g, "") })} />
                  <Button onClick={() => { run(supabase.rpc("declare_result", { _market: m.id, _session: session, _panna: pannas[m.id] ?? "" }), "Result declared & plays settled"); setPannas({ ...pannas, [m.id]: "" }); }}>
                    Declare {session}
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => run(supabase.rpc("reset_market", { _market: m.id }), "Market reset for a new day")}>Reset for new day</Button>
              <Button variant="destructive" onClick={() => confirm(`Delete ${m.name}?`) && run(supabase.from("markets").delete().eq("id", m.id), "Deleted")}>Delete</Button>
            </div>
          </div>
        );
      })}

      <AdminPlays markets={markets ?? []} />
    </main>
  );
}
