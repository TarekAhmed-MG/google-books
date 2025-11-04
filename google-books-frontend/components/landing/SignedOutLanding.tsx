"use client";

import { useGoogleBooks } from "@/app/google-books-provider";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PublicSearch } from "@/components/search/PublicSearch";

// Placeholder
function GoogleyWordmark({ size = "lg" as "lg" | "sm" }) {
    const base = "text-5xl font-semibold tracking-[-0.04em]";
    return (
        <div className={`select-none ${base} text-[#4285F4]`}>
            Mercator Library
        </div>
    );
}

export function SignedOutLanding() {
    // --- FIX: Removed login and isAuthLoading, as they are now in the header ---
    const { authError } = useGoogleBooks();

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
            {/* --- FIX: Removed the absolute-positioned button wrapper --- */}

            <div className="text-center mb-8 select-none">
                <GoogleyWordmark size="lg" />
                <p className="mt-3 text-sm text-muted-foreground">
                    Search millions of books. Save what matters.
                </p>
            </div>

            {authError && (
                <Alert
                    className="w-full max-w-xl mb-4 border-red-300/50 bg-red-50 text-red-700"
                    variant="destructive"
                >
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-sm font-semibold">
                        Login Error
                    </AlertTitle>
                    <AlertDescription className="text-xs">
                        {authError}
                    </AlertDescription>
                </Alert>
            )}

            {/* You would move your search form logic into this component */}
            <PublicSearch />
        </div>
    );
}