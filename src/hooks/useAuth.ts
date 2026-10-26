import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId!).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
      return { ...profile!, isAdmin: !!roles?.some((r) => r.role === "admin") };
    },
  });
}

export function useTodayExpense(userId?: string) {
  return useQuery({
    queryKey: ["today-expense", userId],
    enabled: !!userId,
    refetchInterval: 10000,
    queryFn: async () => {
      const now = new Date();
      const istDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
      const istStartIso = new Date(`${istDateStr}T00:00:00+05:30`).toISOString();

      const { data, error } = await supabase
        .from("bets")
        .select("points, payout, status")
        .eq("user_id", userId!)
        .gte("created_at", istStartIso);

      if (error) throw error;
      const validBets = (data ?? []).filter((b) => b.status !== "refunded");
      const totalExpense = validBets.reduce((acc, b) => acc + (b.points || 0), 0);
      const totalWinnings = validBets.reduce((acc, b) => acc + (b.payout || 0), 0);
      const playsCount = validBets.length;

      return {
        totalExpense,
        totalWinnings,
        playsCount,
      };
    },
  });
}
