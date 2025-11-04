"use client";

import Image from "next/image";
import { useState } from "react";
import { useGoogleBooks } from "@/app/google-books-provider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface BookSummary {
    googleId: string;
    title: string;
    authors?: string[];
    description?: string;
    pageCount?: number;
    thumbnailLink?: string;
}

interface BookSearchResultItemProps {
    book: BookSummary;
}

export function BookSearchResultItem({ book }: BookSearchResultItemProps) {
    const {
        user,
        addableShelves,
        addBookToShelf,
        getMutationState,
        resetMutationStatus,
    } = useGoogleBooks();

    // Local state for the dropdown
    const [selectedShelfId, setSelectedShelfId] = useState<string>("");

    // Get the mutation status for *this specific book*
    const { status, message } = getMutationState(book.googleId);
    const isLoading = status === "loading";

    const handleAdd = async () => {
        if (!selectedShelfId) return;
        try {
            await addBookToShelf(book.googleId, selectedShelfId);
        } catch (e) {
            // Error is already set in context, just log it
            console.error(e);
        }
    };

    const handleShelfChoiceChange = (shelfId: string) => {
        setSelectedShelfId(shelfId);
        resetMutationStatus(book.googleId); // Reset status on new selection
    };

    return (
        <div className="flex gap-3 rounded-lg border bg-card p-3 text-card-foreground transition-all">
            <div className="relative h-24 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                {book.thumbnailLink ? (
                    <Image
                        src={book.thumbnailLink.replace(/^http:/, "https:")}
                        alt={book.title}
                        fill
                        sizes="80px"
                        style={{ objectFit: "cover" }}
                        className="rounded-md"
                    />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">
                        No image
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold line-clamp-2">{book.title}</p>
                {book.authors && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                        {book.authors.join(", ")}
                    </p>
                )}
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {book.description || "No description available."}
                </p>

                {user && addableShelves.length > 0 && (
                    <div className="flex items-center gap-2 mt-3">
                        <Select
                            value={selectedShelfId}
                            onValueChange={handleShelfChoiceChange}
                            disabled={isLoading}
                        >
                            <SelectTrigger className="flex-1 w-full sm:w-[150px] rounded-full h-8 text-xs bg-muted/40 border-muted-foreground/20">
                                <SelectValue placeholder="Add to shelf..." />
                            </SelectTrigger>
                            <SelectContent>
                                {addableShelves.map((shelf) => (
                                    <SelectItem
                                        key={shelf.id}
                                        value={String(shelf.id)}
                                        className="text-xs"
                                    >
                                        {shelf.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            size="sm"
                            className="rounded-full h-8 text-xs px-3"
                            // --- 🔧 FIX 1: Only disable while loading or if no shelf chosen ---
                            disabled={!selectedShelfId || isLoading}
                            onClick={handleAdd}
                        >
                            {isLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            {/* 🔧 FIX 1: Keep the label stable */}
                            {isLoading ? "Adding..." : "Add"}
                        </Button>
                    </div>
                )}
                {/* 🔧 FIX 1: This message now correctly shows status */
                    message && (
                        <p
                            className={`mt-1.5 text-xs ${
                                status === "error" ? "text-destructive" : "text-green-600"
                            }`}
                        >
                            {message}
                        </p>
                    )}
            </div>
        </div>
    );
}