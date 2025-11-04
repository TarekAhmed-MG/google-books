"use client";

import { useGoogleBooks } from "@/app/google-books-provider";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// You would also move your <GoogleyWordmark> and <PublicSearch> components here

// Placeholder
function GoogleyWordmark({ size = "lg" as "lg" | "sm" }) {
    const base = "text-5xl font-semibold tracking-[-0.04em]";
    return <div className={`select-none ${base} text-[#4285F4]`}>Mercator Library</div>;
}

// Placeholder for the search component you'll create
function PublicSearch() {
    return (
        <div className="p-6 border rounded-2xl shadow-sm w-full max-w-xl">
            <p className="text-center text-muted-foreground">
                (Public Book Search Component Goes Here)
            </p>
        </div>
    )
}


export function SignedOutLanding() {
    const { login, isAuthLoading, authError } = useGoogleBooks();

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="absolute right-4 top-4">
                <Button
                    onClick={login}
                    disabled={isAuthLoading}
                    className="rounded-full px-4 py-2 text-sm font-medium shadow-sm"
                >
                    {isAuthLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing in...
                        </>
                    ) : (
                        <>
                            <LogIn className="mr-2 h-4 w-4" />
                            Sign in
                        </>
                    )}
                </Button>
            </div>

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