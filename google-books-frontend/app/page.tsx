"use client";

import Link from "next/link";
import { useGoogleBooks } from "./google-books-provider";
import { SignedOutLanding } from "@/components/landing/SignedOutLanding";
import { SignedInDashboard } from "@/components/dashboard/SignedInDashboard";
import { AppHeader } from "@/components/layout/AppHeader";
import { Loader2 } from "lucide-react";

// You'll move your BRAND_NAME and GoogleyWordmark
// to a shared file, e.g., `components/layout/Brand.tsx`
// For this example, I'll assume they are in AppHeader or the sub-pages.

export default function Home() {
  // Get all state from our hook
  const { user, isAuthLoading } = useGoogleBooks();

  // A simple loading state while GSI initializes
  if (isAuthLoading && !user) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Connecting to Google...
          </p>
        </div>
    );
  }

  return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {/* The Header now gets its state from the hook */}
        <AppHeader />

        {/* Conditionally render the correct view */}
        {user ? <SignedInDashboard /> : <SignedOutLanding />}

          {/* --- 2. MODIFIED THE FOOTER --- */}
          <footer className="px-4 py-6 text-center text-[11px] text-muted-foreground">
              Mercator Library • By Tarek •{" "}
              <Link href="/privacy" className="underline hover:text-primary">
                  Privacy Policy
              </Link>
          </footer>
      </div>
  );
}