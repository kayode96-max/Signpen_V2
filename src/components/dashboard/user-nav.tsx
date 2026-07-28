
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/supabase/types";
import Link from "next/link";

interface UserNavProps {
    user: User;
    onSignOut: () => void;
}

export default function UserNav({ user, onSignOut }: UserNavProps) {
  const name = user.displayName || user.email || 'User';
  const fallback = name.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="size-8">
                <AvatarImage src={user.photoURL || undefined} alt={name} />
                <AvatarFallback>{fallback}</AvatarFallback>
            </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="bg-[#121212] border border-white/10 text-white rounded-2xl shadow-2xl p-2 w-56"
      >
        <DropdownMenuLabel className="font-medium text-white/70 px-3 py-2">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10 my-1" />
        <DropdownMenuItem asChild className="hover:bg-white/10 focus:bg-white/10 focus:text-white rounded-xl px-3 py-2 cursor-pointer transition-colors">
          <Link href="/dashboard">Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="hover:bg-white/10 focus:bg-white/10 focus:text-white rounded-xl px-3 py-2 cursor-pointer transition-colors">
          <Link href="/dashboard/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="hover:bg-white/10 focus:bg-white/10 focus:text-white rounded-xl px-3 py-2 cursor-pointer transition-colors">
          <Link href="/dashboard/customize">Customize</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10 my-1" />
        <DropdownMenuItem 
          onClick={onSignOut}
          className="hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-500 text-red-500 rounded-xl px-3 py-2 cursor-pointer transition-colors"
        >
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
