"use client";

import React, { useEffect } from "react";
import { planDashboardStudents } from "@/lib/security/access";
import { signOut, useUser } from "@/supabase";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/LandingPage/NavBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const plan = planDashboardStudents({
    user: user ? { id: user.uid, isAnonymous: user.isAnonymous } : null,
    authReady: !isUserLoading,
    studentReady: false,
    studentExists: false,
  });

  useEffect(() => {
    if (!plan.redirectToLogin) return;
    // An anonymous signer session is not a dashboard login. Drop it so the
    // page cannot upsert a students row for that uid.
    if (plan.signOutAnonymous) void signOut(null);
    router.replace("/login");
  }, [plan.redirectToLogin, plan.signOutAnonymous, router]);

  if (isUserLoading || !user || user.isAnonymous) {
    return (
      <div className="flex items-center justify-center h-screen bg-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-secondary text-foreground">
      <NavBar />
      <main className="flex-1 px-4 md:px-6">
        {children}
      </main>
    </div>
  );
}
