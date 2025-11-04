"use client";

import Image from "next/image";
import { useState, FormEvent } from "react";
import { useGoogleBooks } from "@/app/google-books-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, X } from "lucide-react";
import { BookSearchResultItem } from "./BookSearchResultItem";

// --- Types ---

interface BookSummary {
    googleId: string;
    title: string;
    authors?: string[];
    description?: string;
    pageCount?: number;
    thumbnailLink?: string;
}

const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL as string;

// --- Component ---

export function PublicSearch() {
    // We only need the 'user' to know if we should show the "Add to shelf" UI
    const { user } = useGoogleBooks();

    // All search state is local to this component
    const [searchTerm, setSearchTerm] = useState("");
    const [searchType, setSearchType] = useState("general");
    const [results, setResults] = useState<BookSummary[]>([]);
    const [isLoadingSearch, setIsLoadingSearch] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoadingSearch(true);
        setSearchError(null);
        setResults([]);

        const apiUrl = `${API_GATEWAY_URL}/api/books/search?term=${encodeURIComponent(
            searchType
        )}&search=${encodeURIComponent(searchTerm)}`;

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                let errorMsg = `Search Error: ${response.status} ${response.statusText}`;
                try {
                    const errorJson = await response.json();
                    errorMsg = errorJson.error || errorJson.message || errorMsg;
                } catch {}
                throw new Error(errorMsg);
            }

            const data: BookSummary[] = await response.json();
            setResults(data);
            if (data.length === 0)
                setSearchError("No books found matching your search.");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setSearchError(message || "Failed to fetch books.");
        } finally {
            setIsLoadingSearch(false);
        }
    };

    return (
        <Card className="rounded-2xl shadow-sm">
            <CardHeader>
                <CardTitle>Find a book</CardTitle>
                <CardDescription>
                    Search the public Google Books library.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <form onSubmit={handleSearch} className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <Select value={searchType} onValueChange={setSearchType}>
                            <SelectTrigger className="w-full sm:w-[130px] rounded-full bg-muted/40 border-muted-foreground/20 text-sm">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="general">All</SelectItem>
                                <SelectItem value="intitle">Title</SelectItem>
                                <SelectItem value="inauthor">Author</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="relative flex-grow">
                            <Input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search books..."
                                required
                                className="w-full rounded-full bg-muted/40 border-muted-foreground/20 text-sm px-4 pr-14 h-10"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setResults([]);
                                        setSearchError(null);
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-muted-foreground/20 bg-background shadow-sm hover:bg-muted active:scale-[0.98] transition"
                                    title="Clear"
                                >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                </button>
                            )}
                        </div>
                    </div>
                    <Button
                        type="submit"
                        disabled={isLoadingSearch || !searchTerm.trim()}
                        className="rounded-full px-5 text-sm font-medium w-full sm:w-auto"
                    >
                        {isLoadingSearch ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Searching...
                            </>
                        ) : (
                            "Search"
                        )}
                    </Button>
                </form>

                {searchError && (
                    <Alert
                        className="mt-2 rounded-lg border-red-300/50 bg-red-50 text-red-700"
                        variant="destructive"
                    >
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="text-sm font-semibold">Notice</AlertTitle>
                        <AlertDescription className="text-xs">
                            {searchError}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Render results using the child component */}
                {results.length > 0 && (
                    <div className="flex flex-col gap-3 pt-4 border-t">
                        <h3 className="text-sm font-medium text-muted-foreground">
                            Search Results
                        </h3>
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                            {results.map((book) => (
                                <BookSearchResultItem key={book.googleId} book={book} />
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}