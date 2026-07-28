"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/supabase';
import { NavLinks } from '../../constants';
import { Button } from '@/components/ui/button';
import { User as UserIcon } from 'lucide-react';
import UserNav from '@/components/dashboard/user-nav';

const NavBar = () => {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await auth.signOut();
    router.push('/');
  };

  // Filter out Login and Sign Up from middle links
  const middleLinks = NavLinks.filter(
    ({ label }) => label !== 'Login' && label !== 'Sign Up'
  );

  return (
    <header className='w-full fixed top-0 left-0 z-50 bg-black/50 backdrop-blur-xl border-none transition-all duration-300'>
      <nav className='container mx-auto flex items-center justify-between py-4 px-6 2xl:px-0'>
        {/* Left Side: Logo */}
        <Link href="/" className="flex items-center">
          <img 
            src="/images/signpen.png" 
            alt="Signpen Logo" 
            width={50} 
            height={50} 
            className='cursor-pointer hover:-translate-y-0.5 transition-all duration-300 ease-in-out'
          />
        </Link>

        {/* Middle Side: Navigation Links */}
        <ul className='hidden md:flex items-center gap-4'>
          {middleLinks.map(({ label }) => (
            <li key={label}>
              <Link 
                href={`/#${label.toLowerCase()}`} 
                className='block rounded-full px-5 py-2 text-white/80 font-medium text-sm cursor-pointer hover:bg-white/10 hover:text-white transition-all duration-300 ease-in-out bg-[#1c1c1e] border border-white/10 shadow-sm'
              >
                {label}
              </Link>
            </li>
          ))}
          {user && (
            <>
              <li>
                <Link 
                  href="/dashboard/settings" 
                  className='block rounded-full px-5 py-2 text-white/80 font-medium text-sm cursor-pointer hover:bg-white/10 hover:text-white transition-all duration-300 ease-in-out bg-[#1c1c1e] border border-white/10 shadow-sm'
                >
                  Settings
                </Link>
              </li>
              <li>
                <Link 
                  href="/dashboard/customize" 
                  className='block rounded-full px-5 py-2 text-white/80 font-medium text-sm cursor-pointer hover:bg-white/10 hover:text-white transition-all duration-300 ease-in-out bg-[#1c1c1e] border border-white/10 shadow-sm'
                >
                  Customize
                </Link>
              </li>
            </>
          )}
        </ul>

        {/* Right Side: Auth Buttons & Avatar */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link 
                href="/dashboard" 
                className="hidden sm:flex rounded-full px-5 py-2 hover:bg-white/10 items-center text-sm text-white transition-colors bg-[#1c1c1e] border border-white/10 shadow-sm font-medium"
              >
                Dashboard
              </Link>
              <button 
                onClick={handleSignOut}
                className="hidden md:flex rounded-full px-5 py-2 hover:bg-white/10 items-center text-sm text-white transition-colors bg-[#1c1c1e] border border-white/10 shadow-sm font-medium"
              >
                Sign Out
              </button>
              <UserNav user={user} onSignOut={handleSignOut} />
            </>
          ) : (
            <>
              <Link 
                href="/login" 
                className="rounded-full px-5 py-2 hover:bg-white/10 flex items-center text-sm text-white transition-colors bg-[#1c1c1e] border border-white/10 shadow-sm font-medium"
              >
                Login
              </Link>
              <Link 
                href="/login" 
                className="rounded-full px-5 py-2 bg-white text-black hover:bg-gray-200 flex items-center text-sm transition-colors shadow-sm font-medium"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};

export default NavBar;