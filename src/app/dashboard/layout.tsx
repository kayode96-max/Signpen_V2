
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
import { LayoutDashboard, Palette, Settings, Loader2, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import UserNav from "@/components/dashboard/user-nav";
import Image from "next/image";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [isUserLoading, user, router]);

  const handleSignOut = async () => {
    await auth.signOut();
    router.push("/");
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
      <Sidebar className="pt-4" collapsible="icon">
        <SidebarHeader>
           <div className="flex items-center gap-3 px-2">
            <Avatar className="size-8">
              <AvatarImage src={user.photoURL || undefined} alt={name} />
              <AvatarFallback>{fallback}</AvatarFallback>
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
              <SidebarMenuButton onClick={handleSignOut} tooltip="Sign Out">
                <LogOut />
                <span>Sign Out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-secondary">
         <header className="md:hidden flex items-center gap-2 px-4 h-16 border-b bg-background">
          <SidebarTrigger />
           <Link
              href="/"
              className="flex items-center justify-center"
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
        <div className="h-full">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
