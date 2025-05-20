'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image'; // Import Next.js Image component

// Helper to get initials
const getInitials = (name: string | null | undefined): string => {
  if (!name) return '?';
  const names = name.split(' ');
  if (names.length === 1) return names[0].charAt(0).toUpperCase();
  return names[0].charAt(0).toUpperCase() + names[names.length - 1].charAt(0).toUpperCase();
};

export default function AuthButton() {
  const { data: session } = useSession();

  if (session && session.user) {
    return (
      <button
        onClick={() => signOut({ callbackUrl: '/' })} // Redirect to home after sign out
        title="Sign out"
        className="flex items-center gap-2 p-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors shadow-sm border border-gray-300 dark:border-gray-600"
      >
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name || "User avatar"}
            width={28} // Slightly smaller avatar if text is present
            height={28}
            className="rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-semibold">
            {getInitials(session.user.name)}
          </div>
        )}
        <div className="flex flex-col items-start leading-tight">
          <span className="text-xs font-semibold">{session.user.name || session.user.email}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Sign out</span>
        </div>
      </button>
    );
  }
  
  // Signed out state - this button will likely not be visible if SignInPopup covers all sign-in scenarios.
  // If it is needed, it should be styled to fit the new fixed position context, or removed.
  // For now, returning null when signed out as the SignInPopup handles this.
  return null; 
} 