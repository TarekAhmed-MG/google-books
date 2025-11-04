"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
    useMemo,
} from "react";
import { useGoogleIdentity } from "@/hooks/use-google-identity";

// --- Types (mostly from your page.tsx) ---

interface DecodedJwt {
    iss: string;
    azp: string;
    aud: string;
    sub: string;
    email: string;
    email_verified: boolean;
    nbf: number;
    name: string;
    picture: string;
    given_name: string;
    family_name: string;
    iat: number;
    exp: number;
    jti: string;
}

interface ShelfInfo {
    id: number;
    title?: string;
    access?: string;
    updated?: string;
    volumesLastUpdated?: string;
    volumeCount?: number;
}

interface BackendTokenResponse {
    access_token: string;
    id_token: string;
    user_info: DecodedJwt;
    expires_in: number;
}

// --- NEW: Types for book mutations (add/remove) ---

type MutationStatus = "idle" | "loading" | "success" | "error";

interface MutationState {
    status: MutationStatus;
    message: string | null;
}

// --- Context Shape (Updated) ---

interface GoogleBooksContextType {
    // Auth
    user: DecodedJwt | null;
    accessToken: string | null;
    idToken: string | null;
    isAuthLoading: boolean;
    authError: string | null;
    login: () => void;
    logout: () => void;

    // Library
    libraryShelves: ShelfInfo[] | null;
    isLoadingShelves: boolean;
    libraryError: string | null;
    fetchLibrary: () => Promise<void>;

    // --- NEW: For BookSearchResultItem & LibraryManager ---
    addableShelves: ShelfInfo[];
    addBookToShelf: (bookId: string, shelfId: string) => Promise<void>;
    removeBookFromShelf: (bookId: string, shelfId: string) => Promise<void>;
    getMutationState: (bookId: string) => MutationState;
}

// --- Context Definition ---

const GoogleBooksContext = createContext<GoogleBooksContextType | undefined>(
    undefined
);

// --- API Config ---
const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL as string;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;

// --- NEW: Config for addable shelves ---
const ALLOWED_SHELVES = ["Reading now", "Favorites", "To read"] as const;

// --- Provider Component ---

export function GoogleBooksProvider({ children }: { children: ReactNode }) {
    // --- Auth State ---
    const [user, setUser] = useState<DecodedJwt | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [idToken, setIdToken] = useState<string | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);

    // --- Library State ---
    const [libraryShelves, setLibraryShelves] = useState<ShelfInfo[] | null>(null);
    const [isLoadingShelves, setIsLoadingShelves] = useState(false);
    const [libraryError, setLibraryError] = useState<string | null>(null);

    // --- NEW: Mutation State ---
    const [mutations, setMutations] = useState<Record<string, MutationState>>({});

    // --- Internal: Clear all session state ---
    const clearSession = useCallback(() => {
        setUser(null);
        setAccessToken(null);
        setIdToken(null);
        setLibraryShelves(null);
        setAuthError(null);
        setLibraryError(null);
        setMutations({});
    }, []);

    // --- Internal: Fetch Library (callable) ---
    const fetchLibrary = useCallback(
        async (accToken: string, idTok: string) => {
            if (!accToken || !idTok) return;

            setIsLoadingShelves(true);
            setLibraryError(null);
            try {
                const resp = await fetch(
                    `${API_GATEWAY_URL}/api/my-library/bookshelves`,
                    {
                        headers: {
                            Authorization: `Bearer ${idTok}`,
                            "X-Google-Access-Token": accToken,
                        },
                    }
                );

                if (!resp.ok) {
                    let msg = `Library fetch failed: ${resp.status} ${resp.statusText}`;
                    if (resp.status === 401) {
                        msg = "Token invalid/expired. Please log in again.";
                        clearSession();
                    } else {
                        try {
                            const err = await resp.json();
                            msg = err.error?.message || err.message || err.error || msg;
                        } catch {}
                    }
                    throw new Error(msg);
                }

                const data = await resp.json();
                setLibraryShelves(
                    data && Array.isArray(data.items) ? (data.items as ShelfInfo[]) : []
                );
            } catch (e: unknown) {
                setLibraryError(e instanceof Error ? e.message : String(e));
            } finally {
                setIsLoadingShelves(false);
            }
        },
        [clearSession]
    );

    // --- Auth Logic: Powered by our new hook ---
    const {
        startLogin,
        isReady: isGsiReady,
        isLoading: isGsiLoading,
    } = useGoogleIdentity({
        clientId: GOOGLE_CLIENT_ID,
        onSuccess: async (codeResponse) => {
            setAuthError(null);
            try {
                const backendResponse = await fetch(
                    `${API_GATEWAY_URL}/api/auth/google/exchange`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code: codeResponse.code }),
                    }
                );

                if (!backendResponse.ok) {
                    const errJson = await backendResponse.json();
                    throw new Error(
                        errJson.error || errJson.message || "Code exchange failed"
                    );
                }

                const tokenData: BackendTokenResponse = await backendResponse.json();

                setUser(tokenData.user_info);
                setAccessToken(tokenData.access_token);
                setIdToken(tokenData.id_token);

                fetchLibrary(tokenData.access_token, tokenData.id_token);
            } catch (ex: unknown) {
                setAuthError(ex instanceof Error ? ex.message : "Login failed");
            }
        },
        onError: (errorMsg) => {
            setAuthError(errorMsg);
        },
    });

    const login = () => {
        if (isGsiReady) {
            startLogin();
        } else {
            setAuthError("Google Login is not ready. Please try again in a moment.");
        }
    };

    const logout = useCallback(() => {
        const tokenToRevoke = accessToken;
        clearSession();

        if (window.google?.accounts?.id) {
            window.google.accounts.id.disableAutoSelect();
        }
        if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
            window.google.accounts.oauth2.revoke(tokenToRevoke, () => {});
        }
    }, [accessToken, clearSession]);

    // --- NEW: Derived state for "addable" shelves ---
    const addableShelves: ShelfInfo[] = useMemo(
        () =>
            (libraryShelves || []).filter((shelf) => {
                const shelfName = (shelf.title || "").trim().toLowerCase();
                return ALLOWED_SHELVES.some(
                    (allowed) => allowed.toLowerCase() === shelfName
                );
            }),
        [libraryShelves]
    );

    // --- FIX: Helper to reset mutation state after a delay ---
    const clearMutationState = (bookId: string) => {
        setTimeout(() => {
            setMutations((prev) => ({
                ...prev,
                [bookId]: { status: "idle", message: null },
            }));
        }, 2000); // Reset after 2 seconds
    };

    // --- NEW: Add book to shelf function ---
    const addBookToShelf = useCallback(
        async (bookId: string, shelfId: string) => {
            if (!accessToken || !idToken) {
                setAuthError("Please log in.");
                return;
            }

            setMutations((prev) => ({
                ...prev,
                [bookId]: { status: "loading", message: null },
            }));

            try {
                const resp = await fetch(
                    `${API_GATEWAY_URL}/api/my-library/bookshelves/${shelfId}/add`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${idToken}`,
                            "X-Google-Access-Token": accessToken,
                        },
                        body: JSON.stringify({ volumeId: bookId }),
                    }
                );

                if (!resp.ok) {
                    let msg = `Add failed: ${resp.status}`;
                    try {
                        const errJson = await resp.json();
                        msg = errJson.error || errJson.message || msg;
                    } catch {}
                    if (resp.status === 401) clearSession();
                    throw new Error(msg);
                }

                setMutations((prev) => ({
                    ...prev,
                    [bookId]: { status: "success", message: "Added ✅" },
                }));

                await fetchLibrary(accessToken, idToken);
                clearMutationState(bookId); // <-- FIX: Reset state after success

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Failed to add book.";
                setMutations((prev) => ({
                    ...prev,
                    [bookId]: { status: "error", message },
                }));
                clearMutationState(bookId); // <-- FIX: Also reset state after error
                throw err;
            }
        },
        [accessToken, idToken, fetchLibrary, clearSession]
    );

    // --- NEW: Remove book from shelf function ---
    const removeBookFromShelf = useCallback(
        async (bookId: string, shelfId: string) => {
            if (!accessToken || !idToken) {
                setAuthError("Please log in.");
                return;
            }

            setMutations((prev) => ({
                ...prev,
                [bookId]: { status: "loading", message: null },
            }));

            try {
                const resp = await fetch(
                    `${API_GATEWAY_URL}/api/my-library/bookshelves/${shelfId}/remove`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${idToken}`,
                            "X-Google-Access-Token": accessToken,
                        },
                        body: JSON.stringify({ volumeId: bookId }),
                    }
                );

                if (!resp.ok) {
                    let msg = `Remove failed: ${resp.status}`;
                    try {
                        const errJson = await resp.json();
                        msg = errJson.error || errJson.message || msg;
                    } catch {}
                    if (resp.status === 401) clearSession();
                    throw new Error(msg);
                }

                setMutations((prev) => ({
                    ...prev,
                    [bookId]: { status: "success", message: "Removed 🗑️" },
                }));

                await fetchLibrary(accessToken, idToken);
                clearMutationState(bookId); // <-- FIX: Reset state after success

            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : "Failed to remove book.";
                setMutations((prev) => ({
                    ...prev,
                    [bookId]: { status: "error", message },
                }));
                clearMutationState(bookId); // <-- FIX: Also reset state after error
                throw err;
            }
        },
        [accessToken, idToken, fetchLibrary, clearSession]
    );

    // --- NEW: Helper to get mutation status for a book ---
    const getMutationState = useCallback(
        (bookId: string): MutationState => {
            return mutations[bookId] || { status: "idle", message: null };
        },
        [mutations]
    );

    // --- Public Context Value (Updated) ---
    const value = useMemo(
        () => ({
            // Auth
            user,
            accessToken,
            idToken,
            isAuthLoading: isGsiLoading,
            authError,
            login,
            logout,
            // Library
            libraryShelves,
            isLoadingShelves,
            libraryError,
            fetchLibrary: () =>
                accessToken && idToken
                    ? fetchLibrary(accessToken, idToken)
                    : Promise.resolve(),
            // Mutations & Derived State
            addableShelves,
            addBookToShelf,
            removeBookFromShelf,
            getMutationState,
        }),
        [
            // Auth
            user,
            accessToken,
            idToken,
            isGsiLoading,
            authError,
            login,
            logout,
            // Library
            libraryShelves,
            isLoadingShelves,
            libraryError,
            fetchLibrary,
            // Mutations & Derived State
            addableShelves,
            addBookToShelf,
            removeBookFromShelf,
            getMutationState,
        ]
    );

    return (
        <GoogleBooksContext.Provider value={value}>
            {children}
        </GoogleBooksContext.Provider>
    );
}

// --- Public Hook ---

export function useGoogleBooks() {
    const context = useContext(GoogleBooksContext);
    if (context === undefined) {
        throw new Error(
            "useGoogleBooks must be used within a GoogleBooksProvider"
        );
    }
    return context;
}