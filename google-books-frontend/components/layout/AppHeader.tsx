"use client";

import Image from "next/image";
import { LogOut, Loader2 } from "lucide-react";
import { useGoogleBooks } from "@/app/google-books-provider";
import { Button } from "@/components/ui/button";

// Assume GoogleyWordmark is moved to its own file
// import { GoogleyWordmark } from "./Brand";

// Placeholder
function GoogleyWordmark({ size = "lg" as "lg" | "sm" }) {
    const base = "text-lg font-semibold tracking-[-0.02em] leading-none";
    return <div className={`select-none ${base} text-[#4285F4]`}>Mercator Library</div>;
}


export function AppHeader() {
    const { user, logout, fetchLibrary, isLoadingShelves } = useGoogleBooks();

    if (!user) {
        // Header is simpler when logged out
        return (
            <header className="flex items-center justify-between border-b bg-card/50 px-4 py-3 sm:px-6">
                <GoogleyWordmark size="sm" />
                {/* Login button is on the landing page, not header */}
            </header>
        )
    }

    // Signed-in header
    return (
        <header className="flex items-center justify-between border-b bg-card/50 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
                <GoogleyWordmark size="sm" />
                <Button
                    onClick={() => fetchLibrary()}
                    variant="outline"
                    size="sm"
                    disabled={isLoadingShelves}
                    className="rounded-full text-xs font-medium h-8 px-3"
                >
                    {isLoadingShelves ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Refresh Library
                </Button>
            </div>

            <div className="flex items-center gap-3">
                <div className="text-right leading-tight">
                    <p className="text-xs font-medium">{user.name}</p>
                    <p className="text-[10px] text-muted-foreground">{user.email}</p>
                </div>

                {user.picture && (
                    <Image
                        src={user.picture}
                        alt="User profile"
                        width={36}
                        height={36}
                        className="rounded-full border bg-muted object-cover"
                    />
                )}

                <Button
                    variant="outline"
                    size="icon"
                    onClick={logout}
                    title="Log Out"
                    className="rounded-full h-8 w-8"
                >
                    <LogOut className="h-4 w-4" />
                </Button>
            </div>
        </header>
    );
}