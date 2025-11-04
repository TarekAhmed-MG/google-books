"use client";

import { AlertCircle } from "lucide-react";
import { useGoogleBooks } from "@/app/google-books-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PublicSearch } from "@/components/search/PublicSearch";
import { LibraryManager } from "@/components/library/LibraryManager";

export function SignedInDashboard() {
    // Get global errors from the context
    const { authError, libraryError } = useGoogleBooks();

    const renderErrorBanners = () =>
        (authError || libraryError) && (
            <div className="px-4 py-2 sm:px-6">
                {authError && (
                    <Alert
                        className="rounded-lg border-red-300/50 bg-red-50 text-red-700"
                        variant="destructive"
                    >
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="text-sm font-semibold">
                            Login / Access Error
                        </AlertTitle>
                        <AlertDescription className="text-xs">
                            {authError}
                        </AlertDescription>
                    </Alert>
                )}

                {libraryError && (
                    <Alert
                        className="mt-2 rounded-lg border-red-300/50 bg-red-50 text-red-700"
                        variant="destructive"
                    >
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="text-sm font-semibold">
                            Library Error
                        </AlertTitle>
                        <AlertDescription className="text-xs">
                            {libraryError}
                        </AlertDescription>
                    </Alert>
                )}
            </div>
        );

    return (
        <main className="flex-1">
            {/* Display any context-level errors */}
            {renderErrorBanners()}

            <div className="px-4 py-6 sm:px-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Col 1: Public Search */}
                    <div className="lg:col-span-1">
                        <PublicSearch />
                    </div>

                    {/* Col 2 & 3: User's Library */}
                    <div className="lg:col-span-2">
                        <LibraryManager />
                    </div>

                </div>
            </div>
        </main>
    );
}