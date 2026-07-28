"use client";

import React, { useEffect } from "react";
import { useUser } from "@/supabase";
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

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading || !user) {
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
