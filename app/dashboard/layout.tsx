"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const guard = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("urssaf_profile")
        .select("user_id")
        .eq("user_id", sessionData.session.user.id)
        .maybeSingle();
      if (cancelled) return;

      if (error) {
        router.replace("/login");
        return;
      }

      if (!profile) {
        router.replace("/onboarding");
        return;
      }

      setChecking(false);
    };

    void guard();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) router.replace("/login");
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
        Chargement…
      </div>
    );
  }

  return <>{children}</>;
}
