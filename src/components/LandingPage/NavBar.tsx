"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
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
    <header className='w-full fixed top-0 left-0 z-50 bg-black/90 backdrop-blur-sm border-b border-white/10'>
      <nav className='container mx-auto flex items-center justify-between px-5 2xl:px-0'>
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
        <ul className='hidden md:flex items-center gap-10'>
          {middleLinks.map(({ label }) => (
            <li key={label}>
              <Link 
                href={`/#${label.toLowerCase()}`} 
                className='text-white/80 font-regular text-sm cursor-pointer hover:text-white transition-all duration-300 ease-in-out'
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right Side: Auth Buttons & Avatar */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" className="text-white hover:text-white/80 hover:bg-white/10 text-sm">
                  Dashboard
                </Button>
              </Link>
              <UserNav user={user} onSignOut={handleSignOut} />
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" className="text-white hover:text-white/80 hover:bg-white/10 text-sm">
                  Login
                </Button>
              </Link>
              <Link href="/login">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium">
                  Sign Up
                </Button>
              </Link>
              <div className="relative h-8 w-8 rounded-full border border-white/20 bg-white/10 flex items-center justify-center text-white/60">
                <UserIcon className="h-4 w-4" />
              </div>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};

export default NavBar;