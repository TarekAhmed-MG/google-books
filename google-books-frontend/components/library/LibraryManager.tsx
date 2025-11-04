"use client";

import Image from "next/image";
import { useState, useCallback, useEffect } from "react";
import { useGoogleBooks } from "@/app/google-books-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, X } from "lucide-react";

// --- Types ---

interface ShelfInfo {
    id: number;
    title?: string;
    volumeCount?: number;
}

interface ShelfVolume {
    id?: string;
    volumeInfo?: {
        title?: string;
        authors?: string[];
        imageLinks?: {
            thumbnail?: string;
        };
    };
}

const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL as string;

// --- Component ---

export function LibraryManager() {
    const {
        libraryShelves,
        isLoadingShelves,
        accessToken,
        idToken,
        removeBookFromShelf,
        getMutationState,
        logout,
        libraryVersion, // <--- 🔧 FIX 2b: Get new version number
    } = useGoogleBooks();

    // Local state for the *active* shelf
    const [activeShelfId, setActiveShelfId] = useState<number | null>(null);
    const [activeShelfTitle, setActiveShelfTitle] = useState<string | null>(null);
    const [shelfVolumes, setShelfVolumes] = useState<ShelfVolume[] | null>(null);
    const [isLoadingVolumes, setIsLoadingVolumes] = useState(false);
    const [shelfError, setShelfError] = useState<string | null>(null);

    // --- Logic: Fetch Volumes for a Shelf ---
    const fetchShelfVolumes = useCallback(
        async (shelfId: number, shelfTitle: string) => {
            if (!accessToken || !idToken) {
                setShelfError("Please log in again.");
                return;
            }

            setIsLoadingVolumes(true);
            setShelfError(null);
            setShelfVolumes(null); // Clear old volumes
            setActiveShelfId(shelfId);
            setActiveShelfTitle(shelfTitle);

            try {
                const response = await fetch(
                    `${API_GATEWAY_URL}/api/my-library/bookshelves/${shelfId}/volumes`,
                    {
                        headers: {
                            Authorization: `Bearer ${idToken}`,
                            "X-Google-Access-Token": accessToken,
                        },
                    }
                );

                if (!response.ok) {
                    let errorMsg = `Shelf fetch failed: ${response.status}`;
                    try {
                        const errJson = await response.json();
                        errorMsg =
                            errJson.error?.message ||
                            errJson.message ||
                            errJson.error ||
                            errorMsg;
                    } catch {}
                    if (response.status === 401) {
                        logout();
                    }
                    throw new Error(errorMsg);
                }

                const data = await response.json();
                const volumes =
                    data && Array.isArray(data.items) ? (data.items as ShelfVolume[]) : [];
                setShelfVolumes(volumes);
            } catch (err: unknown) {
                setShelfError(
                    err instanceof Error ? err.message : "Failed to fetch shelf."
                );
                // Clear active shelf on error
                setActiveShelfId(null);
                setActiveShelfTitle(null);
            } finally {
                setIsLoadingVolumes(false);
            }
        },
        [accessToken, idToken, logout]
    );

    // --- Logic: Remove a Book ---
    const handleRemove = async (volumeId: string, shelfId: number) => {
        try {
            // Optimistic update
            setShelfVolumes((prev) =>
                prev ? prev.filter((v) => v.id !== volumeId) : prev
            );

            // Call provider to update in background
            await removeBookFromShelf(volumeId, String(shelfId));

            // The provider will increment libraryVersion,
            // which will trigger the useEffect below to refetch volumes.

        } catch (e) {
            console.error(e);
            // Refetch to add the book back if the API call failed
            if (activeShelfId) {
                await fetchShelfVolumes(activeShelfId, activeShelfTitle || "");
            }
        }
    };

    // --- Effect: Auto-clear volumes if user logs out ---
    useEffect(() => {
        if (!idToken) {
            setActiveShelfId(null);
            setActiveShelfTitle(null);
            setShelfVolumes(null);
            setShelfError(null);
        }
    }, [idToken]);

    // --- 🔧 FIX 2b: Re-fetch active shelf when library changes ---
    useEffect(() => {
        if (!accessToken || !idToken) return;
        if (!activeShelfId) return;

        // Don't refetch on the initial load (version 0)
        if (libraryVersion === 0) return;

        // Re-sync the active shelf volumes whenever the library changes
        fetchShelfVolumes(activeShelfId, activeShelfTitle || "Shelf");

        // We disable exhaustive-deps as per your instructions
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [libraryVersion]);
    // --- END FIX ---

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column 1: My Shelves */}
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle>My Library</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingShelves && (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {libraryShelves &&
                            libraryShelves.map((shelf) => {
                                // --- 🔧 FIX 3: Always use shelf.volumeCount ---
                                const displayCount = shelf.volumeCount ?? 0;
                                // --- END FIX ---

                                return (
                                    <Button
                                        key={shelf.id}
                                        variant={
                                            activeShelfId === shelf.id ? "default" : "outline"
                                        }
                                        size="sm"
                                        className="rounded-full text-xs font-medium h-8 px-3"
                                        onClick={() =>
                                            fetchShelfVolumes(shelf.id, shelf.title || "Shelf")
                                        }
                                    >
                                        {shelf.title} ({displayCount})
                                    </Button>
                                );
                            })}
                    </div>
                </CardContent>
            </Card>

            {/* Column 2: Shelf Volumes */}
            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle>
                        {activeShelfTitle ? `On: ${activeShelfTitle}` : "Shelf Volumes"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingVolumes && (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {shelfError && (
                        <Alert variant="destructive" className="text-xs">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{shelfError}</AlertDescription>
                        </Alert>
                    )}

                    {!isLoadingVolumes &&
                        shelfVolumes &&
                        shelfVolumes.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                No books on this shelf.
                            </p>
                        )}

                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                        {shelfVolumes &&
                            activeShelfId &&
                            shelfVolumes.map((vol) => {
                                if (!vol.id || !vol.volumeInfo) return null;
                                const { status, message } = getMutationState(vol.id);
                                return (
                                    <div
                                        key={vol.id}
                                        className="flex gap-3 rounded-lg border bg-card p-3 text-card-foreground"
                                    >
                                        <div className="relative h-20 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                                            {vol.volumeInfo.imageLinks?.thumbnail ? (
                                                <Image
                                                    src={vol.volumeInfo.imageLinks.thumbnail.replace(
                                                        /^http:/,
                                                        "https:"
                                                    )}
                                                    alt={vol.volumeInfo.title || ""}
                                                    fill
                                                    sizes="80px"
                                                    style={{ objectFit: "cover" }}
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                                                    No image
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold line-clamp-2">
                                                {vol.volumeInfo.title}
                                            </p>
                                            {vol.volumeInfo.authors && (
                                                <p className="text-xs text-muted-foreground line-clamp-1">
                                                    {vol.volumeInfo.authors.join(", ")}
                                                </p>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full h-7 text-xs px-3 mt-2"
                                                disabled={status === "loading"}
                                                onClick={() => handleRemove(vol.id!, activeShelfId)}
                                            >
                                                {status === "loading" ? (
                                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <X className="mr-2 h-3.5 w-3.5" />
                                                )}
                                                Remove
                                            </Button>
                                            {message && status !== "loading" && (
                                                <p
                                                    className={`mt-1.5 text-xs ${
                                                        status === "error"
                                                            ? "text-destructive"
                                                            : "text-green-600"
                                                    }`}
                                                >
                                                    {message}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}