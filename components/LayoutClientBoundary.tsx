'use client';

import SignInPopup from "@/components/SignInPopup";
import { useSession } from "next-auth/react";
import type { ReactNode } from 'react';

interface LayoutClientBoundaryProps {
  children: ReactNode;
}

export default function LayoutClientBoundary({ children }: LayoutClientBoundaryProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";

  return (
    <>
      {status === "loading" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-neutral-950">
          <p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
        </div>
      ) : !isAuthenticated ? (
        <SignInPopup />
      ) : null}
      {/* Render children regardless of authentication, SignInPopup will overlay if not authenticated */}
      {/* If you want to prevent children from rendering/mounting until authenticated, adjust logic here */}
      {children}
    </>
  );
} 