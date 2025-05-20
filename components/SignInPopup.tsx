'use client';

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import {
  MagnifyingGlassIcon,
  SparklesIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'; // Corrected import path

export default function SignInPopup() {
  const features = [
    {
      name: 'Extract key insights automatically',
      icon: MagnifyingGlassIcon,
    },
    {
      name: 'Generate actionable prompts',
      icon: SparklesIcon,
    },
    {
      name: 'Secure and private analysis',
      icon: ShieldCheckIcon,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white dark:bg-neutral-900 p-8 sm:p-10 rounded-2xl shadow-2xl w-full max-w-md transform transition-all flex flex-col items-center">
        <div className="mb-8">
          <Image src="/Aura_logo.svg" alt="Aura Logo Light" width={180} height={52} className="mx-auto block dark:hidden" />
          <Image src="/Aura_logo_white.svg" alt="Aura Logo Dark" width={180} height={52} className="mx-auto hidden dark:block" />
        </div>

        <h2 className="text-2xl sm:text-3xl font-semibold text-neutral-800 dark:text-neutral-100 mb-4 text-center">
          Welcome to Document Analysis Engine
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-8 text-sm sm:text-base text-center">
          Sign in to transform your documents into actionable prompts and streamline your workflow.
        </p>

        {/* Features List */}
        <div className="mb-10">
          <ul className="space-y-3 w-fit mx-auto">
            {features.map((feature) => (
              <li key={feature.name} className="flex items-start gap-3">
                <feature.icon className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-neutral-700 dark:text-neutral-300 text-sm sm:text-base text-left">
                  {feature.name}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => signIn('azure-ad')}
          className="w-full max-w-xs px-4 py-3 text-base font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 transition-colors flex items-center justify-center gap-2.5"
        >
          <svg width="20" height="20" viewBox="0 0 21 21" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
            <path d="M9.5 9.5H0.5V0.5H9.5V9.5Z" />
            <path d="M20.5 9.5H11.5V0.5H20.5V9.5Z" />
            <path d="M9.5 20.5H0.5V11.5H9.5V20.5Z" />
            <path d="M20.5 20.5H11.5V11.5H20.5V20.5Z" />
          </svg>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
} 