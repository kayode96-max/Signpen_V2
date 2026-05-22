
"use client"

import {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth, useUser } from "@/firebase";
import { LayoutDashboard, Palette, Settings, Loader2, LogOut, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import UserNav from "@/components/dashboard/user-nav";
import Image from "next/image";
import { Button } from "@/components/ui/button";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check if dark mode is enabled
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [isUserLoading, user, router]);

  const handleSignOut = async () => {
    await auth.signOut();
    router.push("/");
  };

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      setIsDark(false);
    } else {
      html.classList.add('dark');
      setIsDark(true);
    }
  };


  if (isUserLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const name = user.displayName || user.email || 'User';
  const fallback = name.charAt(0).toUpperCase();

  return (
    <SidebarProvider>
      <Sidebar className="pt-4 border-r border-border/50 bg-card/50 backdrop-blur-sm" collapsible="icon">
        <SidebarHeader>
           <div className="flex items-center gap-3 px-2">
            <Avatar className="size-8 ring-2 ring-primary/20">
              <AvatarImage src={user.photoURL || undefined} alt={name} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white font-semibold">{fallback}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-sidebar-foreground truncate">{name}</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/dashboard"}
                tooltip="Dashboard"
              >
                <Link href="/dashboard">
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/dashboard/customize"}
                tooltip="Customize"
              >
                <Link href="/dashboard/customize">
                  <Palette />
                  <span>Customize</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton 
                asChild
                isActive={pathname === "/dashboard/settings"}
                tooltip="Settings">
                <Link href="/dashboard/settings">
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleTheme} tooltip={isDark ? "Light Mode" : "Dark Mode"}>
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{isDark ? "Light" : "Dark"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleSignOut} tooltip="Sign Out">
                <LogOut />
                <span>Sign Out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background">
         <header className="md:hidden flex items-center gap-2 px-4 h-16 border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <SidebarTrigger />
           <Link
              href="/"
              className="flex items-center justify-center hover:opacity-80 transition-opacity"
              prefetch={false}
            >
              <Image
                src="/images/signpen.png"
                alt="SignPen Logo"
                width={100}
                height={25}
                className="object-contain"
              />
            </Link>
            <div className="ml-auto">
              <UserNav user={user} onSignOut={handleSignOut} />
            </div>
        </header>
        <div className="min-h-[calc(100vh-4rem)]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
