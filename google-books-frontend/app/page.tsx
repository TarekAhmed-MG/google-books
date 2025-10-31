"use client";

import Image from "next/image";
import { useState, FormEvent, useCallback } from "react";
import { jwtDecode } from "jwt-decode"; // kept in case you want to inspect JWTs later

// --- Shadcn UI Imports ---
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, LogOut, LogIn } from "lucide-react";

// --- Types for Google OAuth Flow ---
interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

interface GoogleCodeResponse {
  code: string;
  scope: string;
  authuser: string;
  prompt: string;
  state?: string;
}

interface GoogleErrorResponse {
  type: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
  state?: string;
}

interface GoogleCodeClient {
  requestCode: () => void;
}

// --- Token response from backend after code exchange ---
interface BackendTokenResponse {
  access_token: string; // Google OAuth access token (used to call Google Books)
  id_token: string; // Google ID token (JWT) validated by Kong OIDC
  user_info: DecodedJwt; // decoded ID token payload for UI
  expires_in: number;
}

// --- Decoded Google ID token payload ---
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

// --- Book Summary interface for search results ---
interface BookSummary {
  googleId: string;
  title: string;
  authors?: string[];
  description?: string;
  pageCount?: number;
  thumbnailLink?: string;
}

// --- Minimal volume shape for shelf contents ---
interface ShelfVolume {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    pageCount?: number;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    publishedDate?: string;
    publisher?: string;
  };
}

// --- Shelf shape we expect back from /api/my-library/bookshelves ---
interface ShelfInfo {
  id: number;
  title?: string;
  access?: string;
  updated?: string;
  volumesLastUpdated?: string;
  volumeCount?: number;
}

// --- Global declaration for Google's OAuth client on window ---
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            ux_mode?: string;
          }) => void;
          renderButton: (
              parent: HTMLElement,
              options: {
                theme?: string;
                size?: string;
                type?: string;
                shape?: string;
                text?: string;
                width?: string;
                logo_alignment?: string;
              }
          ) => void;
          prompt: (momentListener?: (notification: any) => void) => void;
          disableAutoSelect: () => void;
        };
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: "popup" | "redirect";
            redirect_uri?: string;
            callback?: (codeResponse: GoogleCodeResponse) => void;
            error_callback?: (errorResponse: GoogleErrorResponse) => void;
            state?: string;
            enable_granular_consent?: boolean;
          }) => GoogleCodeClient;
          hasGrantedAllScopes: (tokenResponse: any, scope: string) => boolean;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

export default function Home() {
  // --- Search State ---
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchType, setSearchType] = useState<string>("general");
  const [results, setResults] = useState<BookSummary[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // --- Auth / Session State ---
  const [user, setUser] = useState<DecodedJwt | null>(null);

  // Google OAuth access token -> backend uses this to call Google Books
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Google ID token (JWT) -> Kong validates this before proxying protected routes
  const [idToken, setIdToken] = useState<string | null>(null);

  // --- Shelves and library state ---
  const [libraryShelves, setLibraryShelves] = useState<ShelfInfo[] | null>(
      null
  );

  // Active shelf detail view
  const [activeShelfId, setActiveShelfId] = useState<number | null>(null);
  const [activeShelfTitle, setActiveShelfTitle] = useState<string | null>(null);
  const [shelfVolumes, setShelfVolumes] = useState<ShelfVolume[] | null>(null);
  const [isLoadingShelfVolumes, setIsLoadingShelfVolumes] =
      useState<boolean>(false);
  const [shelfError, setShelfError] = useState<string | null>(null);

  // --- UI state for login / errors ---
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // --- Add-to-shelf interaction state ---
  // For each book (by googleId), which shelf ID did the user choose?
  const [addShelfChoice, setAddShelfChoice] = useState<
      Record<string, string>
  >({});
  // Tracks status per book for add: "Added ✅", "Choose a shelf first", error message, etc.
  const [addStatus, setAddStatus] = useState<Record<string, string>>({});
  // Loading state per book while we POST add
  const [addLoading, setAddLoading] = useState<Record<string, boolean>>({});

  // --- Remove-from-shelf interaction state ---
  // Tracks status per volume ID inside a shelf (success / error)
  const [removeStatus, setRemoveStatus] = useState<Record<string, string>>({});
  // Loading state for remove button per volume
  const [removeLoading, setRemoveLoading] = useState<Record<string, boolean>>(
      {}
  );

  // --- Env / Config ---
  const apiGatewayUrl =
      process.env.NEXT_PUBLIC_API_GATEWAY_URL || "http://104.154.223.55";

  const googleClientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      "1033367449745-tgkqjo35chh3mqiprqqo8lfup01am8p6.apps.googleusercontent.com";

  // --- Allowed shelves to add to ---
  // we only expose these in the "Add" dropdown
  const ALLOWED_SHELVES = ["Reading now", "Favorites", "To read"] as const;

  // Build the dropdown list from whatever shelves the API returned
  const addableShelves: ShelfInfo[] = (libraryShelves || []).filter((shelf) => {
    const shelfName = (shelf.title || "").trim().toLowerCase();
    return ALLOWED_SHELVES.some(
        (allowed) => allowed.toLowerCase() === shelfName
    );
  });

  // --- Auth: Google popup -> auth code -> backend exchange ---
  const handleLoginClick = useCallback(() => {
    if (
        !window.google ||
        !window.google.accounts ||
        !window.google.accounts.oauth2
    ) {
      console.error("Google OAuth2 client not loaded");
      setAuthError(
          "Google Login library not ready. Please try again in a moment."
      );
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const client = window.google.accounts.oauth2.initCodeClient({
        client_id: googleClientId,
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/books",
        ].join(" "),
        ux_mode: "popup",
        callback: async (codeResponse) => {
          console.log("Received auth code response:", codeResponse);

          if (!codeResponse.code) {
            console.error("No authorization code received from Google.");
            setAuthError("Login failed: No authorization code received.");
            setIsAuthLoading(false);
            return;
          }

          try {
            // Exchange code for tokens via backend (through Kong)
            const backendResponse = await fetch(
                `${apiGatewayUrl}/api/auth/google/exchange`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ code: codeResponse.code }),
                }
            );

            if (!backendResponse.ok) {
              let errorMsg = `Code exchange failed: ${backendResponse.statusText}`;
              try {
                const errJson = await backendResponse.json();
                errorMsg = errJson.error || errorMsg;
              } catch {
                /* ignore parse error */
              }
              throw new Error(errorMsg);
            }

            const tokenData: BackendTokenResponse =
                await backendResponse.json();
            console.log("Received tokens from backend:", tokenData);

            // UI info for header
            setUser(tokenData.user_info);

            // Tokens we will use on protected calls
            setAccessToken(tokenData.access_token); // used to call Google Books
            setIdToken(tokenData.id_token); // validated by Kong OIDC
          } catch (exchangeError: any) {
            console.error("Error exchanging code:", exchangeError);
            setAuthError(
                exchangeError.message || "Failed to exchange authorization code."
            );
          } finally {
            setIsAuthLoading(false);
          }
        },
        error_callback: (errorResponse: GoogleErrorResponse) => {
          console.error("Google Auth Code Error:", errorResponse);
          setAuthError(
              errorResponse?.error_description ||
              errorResponse?.error ||
              "Google login failed."
          );
          setIsAuthLoading(false);
        },
      });

      client.requestCode();
    } catch (initError) {
      console.error("Error initializing Google Code Client:", initError);
      setAuthError("Could not start Google login process.");
      setIsAuthLoading(false);
    }
  }, [apiGatewayUrl, googleClientId]);

  // --- Logout ---
  const handleLogout = () => {
    const tokenToRevoke = accessToken; // capture before clearing so we can revoke

    setUser(null);
    setAccessToken(null);
    setIdToken(null);

    setLibraryShelves(null);
    setActiveShelfId(null);
    setActiveShelfTitle(null);
    setShelfVolumes(null);
    setShelfError(null);

    setAuthError(null);
    setSearchError(null);
    setShelfError(null);
    setAddStatus({});
    setAddShelfChoice({});
    setAddLoading({});
    setRemoveStatus({});
    setRemoveLoading({});

    // Stop Google from auto-selecting this user silently in future
    if (
        window.google &&
        window.google.accounts &&
        window.google.accounts.id
    ) {
      window.google.accounts.id.disableAutoSelect();
    }

    // Revoke Google's access token for hygiene
    if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(tokenToRevoke, () => {
        console.log("Google Access Token revoked.");
      });
    }

    console.log("User logged out");
  };

  // --- Search Google Books through your backend (public-ish) ---
  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoadingSearch(true);
    setSearchError(null);
    setResults([]);

    const apiUrl = `${apiGatewayUrl}/api/books/search?term=${encodeURIComponent(
        searchType
    )}&search=${encodeURIComponent(searchTerm)}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        let errorMsg = `Search Error: ${response.status} ${response.statusText}`;
        try {
          const errorJson = await response.json();
          errorMsg = errorJson.error || errorMsg;
        } catch {
          /* ignore parse error */
        }
        throw new Error(errorMsg);
      }

      const data: BookSummary[] = await response.json();
      setResults(data);

      if (data.length === 0) {
        setSearchError("No books found matching your search criteria.");
      }
    } catch (err: any) {
      console.error("Search failed:", err);
      setSearchError(err.message || "Failed to fetch books.");
    } finally {
      setIsLoadingSearch(false);
    }
  };

  // --- Fetch ALL shelves (/mylibrary/bookshelves) ---
  const fetchMyLibrary = async () => {
    if (!accessToken || !idToken) {
      setAuthError("Please log in to view your library.");
      return;
    }

    setIsLoadingSearch(true);
    setSearchError(null);
    setAuthError(null);

    // Reset currently showing shelf
    setActiveShelfId(null);
    setActiveShelfTitle(null);
    setShelfVolumes(null);
    setShelfError(null);

    const myLibraryUrl = `${apiGatewayUrl}/api/my-library/bookshelves`;

    try {
      const response = await fetch(myLibraryUrl, {
        headers: {
          Authorization: `Bearer ${idToken}`, // validated by Kong
          "X-Google-Access-Token": accessToken ?? "", // forwarded to Google by backend
        },
      });

      if (!response.ok) {
        let errorMsg = `Library fetch failed: ${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          errorMsg =
              errJson.error?.message ||
              errJson.message ||
              errJson.error ||
              errorMsg;
        } catch {
          /* ignore */
        }

        if (response.status === 401 || response.status === 403) {
          errorMsg =
              "Authentication failed or token invalid/expired. Please log in again.";
          handleLogout();
        }

        throw new Error(errorMsg);
      }

      const libraryData = await response.json();
      console.log("My Library Shelves:", libraryData);

      if (libraryData && Array.isArray(libraryData.items)) {
        setLibraryShelves(libraryData.items as ShelfInfo[]);
        setSearchError(null);
      } else {
        setLibraryShelves([]);
        setSearchError("No shelves found in your library.");
      }
    } catch (err: any) {
      console.error("Error fetching library:", err);
      setAuthError(err.message || "Failed to fetch library.");
    } finally {
      setIsLoadingSearch(false);
    }
  };

  // --- Fetch the volumes in a specific shelf (user clicks "View Shelf #x") ---
  const fetchShelfVolumes = async (shelfId: number, shelfTitle: string) => {
    if (!accessToken || !idToken) {
      setAuthError("Please log in again.");
      return;
    }

    setIsLoadingShelfVolumes(true);
    setShelfError(null);
    setShelfVolumes(null);
    setActiveShelfId(shelfId);
    setActiveShelfTitle(shelfTitle);

    const shelfUrl = `${apiGatewayUrl}/api/my-library/bookshelves/${shelfId}/volumes`;

    try {
      const response = await fetch(shelfUrl, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          "X-Google-Access-Token": accessToken ?? "",
        },
      });

      if (!response.ok) {
        let errorMsg = `Shelf fetch failed: ${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          errorMsg =
              errJson.error?.message ||
              errJson.message ||
              errJson.error ||
              errorMsg;
        } catch {
          /* ignore */
        }

        if (response.status === 401 || response.status === 403) {
          errorMsg =
              "Authentication failed or token invalid/expired. Please log in again.";
          handleLogout();
        }

        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log(`Volumes for shelf #${shelfId}:`, data);

      if (data && Array.isArray(data.items)) {
        setShelfVolumes(data.items as ShelfVolume[]);
      } else {
        setShelfVolumes([]);
      }

      // clear old remove states on shelf change
      setRemoveStatus({});
      setRemoveLoading({});
    } catch (err: any) {
      console.error("Error fetching shelf volumes:", err);
      setShelfError(err.message || "Failed to fetch shelf volumes.");
    } finally {
      setIsLoadingShelfVolumes(false);
    }
  };

  // --- Helper: refresh libraryShelves (and active shelf, if open) after add/remove ---
  const refreshLibraryAfterMutation = async () => {
    if (!accessToken || !idToken) return;

    // 1. refresh the shelves list silently
    try {
      const resp = await fetch(`${apiGatewayUrl}/api/my-library/bookshelves`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          "X-Google-Access-Token": accessToken ?? "",
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.items)) {
          setLibraryShelves(data.items as ShelfInfo[]);
        } else {
          setLibraryShelves([]);
        }
      } else {
        if (resp.status === 401 || resp.status === 403) {
          handleLogout();
        }
      }
    } catch (e) {
      console.error("refreshLibraryAfterMutation shelves error:", e);
    }

    // 2. if user is currently viewing a shelf, refresh just that shelf's volumes
    if (activeShelfId !== null) {
      try {
        const shelfResp = await fetch(
            `${apiGatewayUrl}/api/my-library/bookshelves/${activeShelfId}/volumes`,
            {
              headers: {
                Authorization: `Bearer ${idToken}`,
                "X-Google-Access-Token": accessToken ?? "",
              },
            }
        );

        if (shelfResp.ok) {
          const shelfJson = await shelfResp.json();
          if (shelfJson && Array.isArray(shelfJson.items)) {
            setShelfVolumes(shelfJson.items as ShelfVolume[]);
          } else {
            setShelfVolumes([]);
          }
        } else {
          if (shelfResp.status === 401 || shelfResp.status === 403) {
            handleLogout();
          }
        }
      } catch (e) {
        console.error("refreshLibraryAfterMutation shelf error:", e);
      }
    }
  };

  // --- Add a book from search results into a chosen shelf ---
  // Calls POST /api/my-library/bookshelves/:shelfId/add
  const addBookToShelf = async (bookId: string) => {
    // bookId here is the Google "volumeId" we stored as book.googleId
    if (!accessToken || !idToken) {
      setAuthError("Please log in.");
      return;
    }

    const chosenShelfId = addShelfChoice[bookId];
    if (!chosenShelfId) {
      setAddStatus((prev) => ({
        ...prev,
        [bookId]: "Choose a shelf first",
      }));
      return;
    }

    // mark this book as loading
    setAddLoading((prev) => ({ ...prev, [bookId]: true }));
    setAddStatus((prev) => ({ ...prev, [bookId]: "" }));

    try {
      const resp = await fetch(
          `${apiGatewayUrl}/api/my-library/bookshelves/${chosenShelfId}/add`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
              "X-Google-Access-Token": accessToken ?? "",
            },
            body: JSON.stringify({ volumeId: bookId }),
          }
      );

      if (!resp.ok) {
        let msg = `Add failed: ${resp.status} ${resp.statusText}`;
        try {
          const errJson = await resp.json();
          msg = errJson.error || msg;
        } catch {
          /* ignore parse error */
        }
        if (resp.status === 401 || resp.status === 403) {
          handleLogout();
          msg = "Session expired. Please log in again.";
        }
        throw new Error(msg);
      }

      console.log("✅ Added", bookId, "to shelf", chosenShelfId);

      setAddStatus((prev) => ({
        ...prev,
        [bookId]: "Added ✅",
      }));

      // refresh shelves + active shelf view
      await refreshLibraryAfterMutation();
    } catch (err: any) {
      console.error("Error adding to shelf:", err);
      setAddStatus((prev) => ({
        ...prev,
        [bookId]: err.message || "Failed to add book.",
      }));
      setAuthError(err.message || "Failed to add book to shelf.");
    } finally {
      setAddLoading((prev) => ({ ...prev, [bookId]: false }));
    }
  };

  // --- Remove a volume from the active shelf ---
  // Calls POST /api/my-library/bookshelves/:shelfId/remove
  const removeBookFromShelf = async (volumeId: string | undefined) => {
    if (!volumeId) {
      return;
    }
    if (!accessToken || !idToken) {
      setAuthError("Please log in.");
      return;
    }
    if (activeShelfId === null) {
      setShelfError("No shelf selected.");
      return;
    }

    // mark this volume as loading
    setRemoveLoading((prev) => ({ ...prev, [volumeId]: true }));
    setRemoveStatus((prev) => ({ ...prev, [volumeId]: "" }));

    try {
      const resp = await fetch(
          `${apiGatewayUrl}/api/my-library/bookshelves/${activeShelfId}/remove`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
              "X-Google-Access-Token": accessToken ?? "",
            },
            body: JSON.stringify({ volumeId }),
          }
      );

      if (!resp.ok) {
        let msg = `Remove failed: ${resp.status} ${resp.statusText}`;
        try {
          const errJson = await resp.json();
          msg = errJson.error || msg;
        } catch {
          /* ignore parse error */
        }
        if (resp.status === 401 || resp.status === 403) {
          handleLogout();
          msg = "Session expired. Please log in again.";
        }
        throw new Error(msg);
      }

      console.log("🗑️ Removed", volumeId, "from shelf", activeShelfId);

      setRemoveStatus((prev) => ({
        ...prev,
        [volumeId]: "Removed 🗑️",
      }));

      // optimistically filter from UI
      setShelfVolumes((prev) =>
          prev ? prev.filter((v) => v.id !== volumeId) : prev
      );

      // ALSO refresh shelves + active shelf view to stay in sync with Google
      await refreshLibraryAfterMutation();
    } catch (err: any) {
      console.error("Error removing from shelf:", err);
      setRemoveStatus((prev) => ({
        ...prev,
        [volumeId]:
            err.message || "Failed to remove book from this shelf.",
      }));
      setShelfError(err.message || "Failed to remove book from this shelf.");
    } finally {
      setRemoveLoading((prev) => ({ ...prev, [volumeId]: false }));
    }
  };

  // --- UI helper: update which shelf the user picked for a given book ---
  const handleShelfChoiceChange = (bookId: string, shelfId: string) => {
    setAddShelfChoice((prev) => ({
      ...prev,
      [bookId]: shelfId,
    }));
    setAddStatus((prev) => ({
      ...prev,
      [bookId]: "",
    }));
  };

  // --- RENDER ---
  return (
      <div className="container mx-auto font-sans p-4 sm:p-8 min-h-screen flex flex-col">
        {/* HEADER / AUTH BAR */}
        <header className="text-center my-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-bold">Google Books Search</h1>

          <div className="auth-section">
            {!user && (
                <Button onClick={handleLoginClick} disabled={isAuthLoading}>
                  {isAuthLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <LogIn className="mr-2 h-4 w-4" /> Sign in with Google
                </Button>
            )}

            {user && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex flex-row gap-4 items-center">
                    <Button
                        onClick={fetchMyLibrary}
                        variant="outline"
                        disabled={isLoadingSearch}
                    >
                      {isLoadingSearch && results.length === 0 && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      View My Library
                    </Button>

                    <div className="text-right">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>

                    {user.picture && (
                        <Image
                            src={user.picture}
                            alt="User profile"
                            width={40}
                            height={40}
                            className="rounded-full"
                        />
                    )}

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleLogout}
                        title="Log Out"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>

                  {libraryShelves && libraryShelves.length > 0 && (
                      <p className="text-[11px] text-muted-foreground text-center sm:text-right leading-tight">
                        Tip: pick a shelf on a book card and click &quot;Add&quot;
                      </p>
                  )}
                </div>
            )}
          </div>
        </header>

        {/* AUTH / ACCESS ERRORS */}
        {authError && (
            <Alert className="w-full max-w-2xl mx-auto mb-4" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Login / Access Error</AlertTitle>
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
        )}

        {/* SEARCH FORM */}
        <form
            onSubmit={handleSearch}
            className="flex flex-col sm:flex-row gap-2 w-full max-w-2xl mx-auto items-center mb-8"
        >
          <Select value={searchType} onValueChange={setSearchType}>
            <SelectTrigger className="w-full sm:w-[120px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="intitle">Title</SelectItem>
              <SelectItem value="inauthor">Author</SelectItem>
            </SelectContent>
          </Select>

          <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for books..."
              required
              className="flex-grow"
          />

          <Button
              type="submit"
              disabled={isLoadingSearch || !searchTerm.trim()}
              className="w-full sm:w-auto"
          >
            {isLoadingSearch && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isLoadingSearch ? "Searching..." : "Search"}
          </Button>
        </form>

        {/* MAIN CONTENT */}
        <main className="flex-grow w-full max-w-5xl mx-auto">
          {/* GLOBAL LOADING INDICATOR */}
          {isLoadingSearch && (
              <div className="flex justify-center items-center mt-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading...</span>
              </div>
          )}

          {/* NOTICE / ERROR */}
          {searchError && !isLoadingSearch && (
              <Alert
                  variant="destructive"
                  className="w-full max-w-2xl mx-auto mt-4"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Notice</AlertTitle>
                <AlertDescription>{searchError}</AlertDescription>
              </Alert>
          )}

          {/* INITIAL EMPTY STATE */}
          {!isLoadingSearch &&
              !searchError &&
              results.length === 0 &&
              !authError &&
              !libraryShelves && (
                  <p className="text-center text-muted-foreground mt-10">
                    {searchTerm && !isLoadingSearch
                        ? "No books found."
                        : "Search for a book, or sign in and load your library."}
                  </p>
              )}

          {/* SEARCH RESULTS GRID */}
          {!isLoadingSearch && !searchError && results.length > 0 && (
              <section className="mb-12">
                <h2 className="text-xl font-semibold mb-4 flex items-center justify-between">
                  <span>Search Results</span>
                  <span className="text-sm text-muted-foreground">
                {results.length} result
                    {results.length === 1 ? "" : "s"}
              </span>
                </h2>

                <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {results.map((book) => {
                    const thisBookId = book.googleId;
                    const chosenShelfId = addShelfChoice[thisBookId] || "";
                    const statusMsg = addStatus[thisBookId] || "";
                    const isAdding = !!addLoading[thisBookId];

                    return (
                        <Card
                            key={thisBookId}
                            className="flex flex-col overflow-hidden"
                        >
                          <CardHeader className="p-4">
                            {book.thumbnailLink ? (
                                <div className="relative aspect-[3/4] w-full mb-2 bg-muted rounded-md overflow-hidden">
                                  <Image
                                      src={book.thumbnailLink.replace(/^http:/, "https:")}
                                      alt={`Cover of ${book.title}`}
                                      fill
                                      sizes="(max-width: 640px) 90vw, (max-width: 768px) 45vw, (max-width: 1024px) 30vw, 23vw"
                                      style={{ objectFit: "contain" }}
                                      className="transition-opacity opacity-0 duration-500"
                                      onLoadingComplete={(image) =>
                                          image.classList.remove("opacity-0")
                                      }
                                      unoptimized={book.thumbnailLink.includes(
                                          "googleusercontent.com"
                                      )}
                                      onError={(e) => {
                                        const parentDiv =
                                            e.currentTarget.closest("div");
                                        if (parentDiv) parentDiv.style.display = "none";
                                        const cardHeader =
                                            e.currentTarget.closest(".p-4");
                                        const placeholder = cardHeader?.querySelector(
                                            ".image-placeholder-fallback"
                                        ) as HTMLElement | null;
                                        if (placeholder)
                                          placeholder.style.display = "flex";
                                      }}
                                  />
                                  <div
                                      className="image-placeholder-fallback absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs p-2 text-center"
                                      style={{ display: "none" }}
                                  >
                                    Image not available
                                  </div>
                                </div>
                            ) : (
                                <div className="aspect-[3/4] w-full mb-2 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs p-2 text-center">
                                  Image not available
                                </div>
                            )}

                            <CardTitle className="text-base font-semibold line-clamp-2">
                              {book.title}
                            </CardTitle>

                            {book.authors && (
                                <CardDescription className="text-xs line-clamp-1">
                                  By {book.authors.join(", ")}
                                </CardDescription>
                            )}
                          </CardHeader>

                          <CardContent className="p-4 pt-0 flex-grow">
                            <p className="text-xs text-muted-foreground line-clamp-4">
                              {book.description || "No description available."}
                            </p>
                          </CardContent>

                          <CardFooter className="p-4 pt-0 flex flex-col gap-2 text-xs text-muted-foreground">
                            {book.pageCount ? (
                                <span className="text-[11px]">
                          {book.pageCount} pages
                        </span>
                            ) : null}

                            {/* Add-to-shelf controls (only if logged in AND we have allowed shelves) */}
                            {user && addableShelves && addableShelves.length > 0 ? (
                                <div className="w-full flex flex-col gap-2">
                                  <div className="flex flex-row gap-2 items-center">
                                    <Select
                                        value={chosenShelfId}
                                        onValueChange={(val) =>
                                            handleShelfChoiceChange(thisBookId, val)
                                        }
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select shelf…" />
                                      </SelectTrigger>

                                      <SelectContent>
                                        {addableShelves.length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-muted-foreground">
                                              No writable shelves found.
                                            </div>
                                        ) : (
                                            addableShelves.map((shelf) => (
                                                <SelectItem
                                                    key={shelf.id}
                                                    value={String(shelf.id)}
                                                >
                                                  {shelf.title || `Shelf ${shelf.id}`}{" "}
                                                  {typeof shelf.volumeCount === "number"
                                                      ? `(${shelf.volumeCount})`
                                                      : ""}
                                                </SelectItem>
                                            ))
                                        )}
                                      </SelectContent>
                                    </Select>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isAdding}
                                        onClick={() => addBookToShelf(thisBookId)}
                                        title="Add this book to the selected shelf"
                                    >
                                      {isAdding ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                          "Add"
                                      )}
                                    </Button>
                                  </div>

                                  {statusMsg && (
                                      <span
                                          className={
                                            statusMsg.includes("Added")
                                                ? "text-[11px] text-green-600"
                                                : "text-[11px] text-red-600"
                                          }
                                      >
                              {statusMsg}
                            </span>
                                  )}
                                </div>
                            ) : user && !libraryShelves ? (
                                <span className="text-[11px] text-muted-foreground">
                          Load &quot;My Library&quot; first to add this.
                        </span>
                            ) : user && addableShelves.length === 0 ? (
                                <span className="text-[11px] text-muted-foreground">
                          No supported target shelves.
                        </span>
                            ) : null}
                          </CardFooter>
                        </Card>
                    );
                  })}
                </div>
              </section>
          )}

          {/* USER'S SHELVES GRID (AFTER "View My Library") */}
          {!isLoadingSearch && libraryShelves && (
              <section className="mb-12">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between mb-4">
                  <h2 className="text-xl font-semibold">
                    Your Google Books Shelves
                  </h2>
                  <span className="text-sm text-muted-foreground mt-2 sm:mt-0">
                {libraryShelves.length} shelf
                    {libraryShelves.length === 1 ? "" : "s"}
              </span>
                </div>

                {libraryShelves.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center">
                      You don't have any shelves yet.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {libraryShelves.map((shelf) => (
                          <Card key={shelf.id} className="flex flex-col">
                            <CardHeader className="p-4 pb-2">
                              <CardTitle className="text-base font-semibold line-clamp-1">
                                {shelf.title || "Untitled Shelf"}
                              </CardTitle>

                              <CardDescription className="text-xs text-muted-foreground flex flex-col">
                        <span>
                          {shelf.volumeCount != null
                              ? `${shelf.volumeCount} book${
                                  shelf.volumeCount === 1 ? "" : "s"
                              }`
                              : "0 books"}
                        </span>

                                {shelf.access && (
                                    <span className="uppercase tracking-wide text-[10px] text-muted-foreground/70">
                            {shelf.access}
                          </span>
                                )}
                              </CardDescription>
                            </CardHeader>

                            <CardContent className="p-4 pt-0 text-xs text-muted-foreground flex flex-col gap-1">
                              {shelf.updated && (
                                  <p>
                          <span className="font-medium text-foreground">
                            Updated:
                          </span>{" "}
                                    {shelf.updated}
                                  </p>
                              )}
                              {shelf.volumesLastUpdated && (
                                  <p>
                          <span className="font-medium text-foreground">
                            Volumes last updated:
                          </span>{" "}
                                    {shelf.volumesLastUpdated}
                                  </p>
                              )}
                            </CardContent>

                            <CardFooter className="p-4 pt-0">
                              <Button
                                  variant="outline"
                                  className="w-full text-xs"
                                  onClick={() =>
                                      fetchShelfVolumes(
                                          shelf.id,
                                          shelf.title || `Shelf ${shelf.id}`
                                      )
                                  }
                                  disabled={isLoadingShelfVolumes}
                                  title={`View books in '${shelf.title || shelf.id}'`}
                              >
                                {isLoadingShelfVolumes &&
                                activeShelfId === shelf.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                View Shelf #{shelf.id}
                              </Button>
                            </CardFooter>
                          </Card>
                      ))}
                    </div>
                )}
              </section>
          )}

          {/* ACTIVE SHELF VOLUMES */}
          {libraryShelves && activeShelfId !== null && (
              <section className="mb-16">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between mb-4">
                  <h2 className="text-xl font-semibold">
                    Shelf {activeShelfId}
                    {activeShelfTitle ? ` – ${activeShelfTitle}` : ""}
                  </h2>

                  {isLoadingShelfVolumes && (
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading shelf…
                </span>
                  )}
                </div>

                {shelfError && (
                    <Alert
                        variant="destructive"
                        className="w-full max-w-2xl mx-auto mt-4"
                    >
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Shelf Error</AlertTitle>
                      <AlertDescription>{shelfError}</AlertDescription>
                    </Alert>
                )}

                {!isLoadingShelfVolumes &&
                    shelfVolumes &&
                    shelfVolumes.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center">
                          No books in this shelf.
                        </p>
                    )}

                {!isLoadingShelfVolumes &&
                    shelfVolumes &&
                    shelfVolumes.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          {shelfVolumes.map((vol, idx) => {
                            const info = vol.volumeInfo || {};
                            const thumb =
                                info.imageLinks?.thumbnail ||
                                info.imageLinks?.smallThumbnail ||
                                "";
                            const volId = vol.id || `vol-${idx}`;

                            const isRemoving = !!removeLoading[volId];
                            const removeMsg = removeStatus[volId] || "";

                            return (
                                <Card
                                    key={vol.id || `${activeShelfId}-${idx}`}
                                    className="flex flex-col overflow-hidden"
                                >
                                  <CardHeader className="p-4">
                                    {thumb ? (
                                        <div className="relative aspect-[3/4] w-full mb-2 bg-muted rounded-md overflow-hidden">
                                          <Image
                                              src={thumb.replace(/^http:/, "https:")}
                                              alt={`Cover of ${info.title || "Untitled"}`}
                                              fill
                                              sizes="(max-width: 640px) 90vw, (max-width: 768px) 45vw, (max-width: 1024px) 30vw, 23vw"
                                              style={{ objectFit: "contain" }}
                                              className="transition-opacity opacity-0 duration-500"
                                              onLoadingComplete={(image) =>
                                                  image.classList.remove("opacity-0")
                                              }
                                              unoptimized={thumb.includes(
                                                  "googleusercontent.com"
                                              )}
                                              onError={(e) => {
                                                const parentDiv =
                                                    e.currentTarget.closest("div");
                                                if (parentDiv)
                                                  parentDiv.style.display = "none";
                                                const cardHeader =
                                                    e.currentTarget.closest(".p-4");
                                                const placeholder = cardHeader?.querySelector(
                                                    ".image-placeholder-fallback"
                                                ) as HTMLElement | null;
                                                if (placeholder)
                                                  placeholder.style.display = "flex";
                                              }}
                                          />
                                          <div
                                              className="image-placeholder-fallback absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs p-2 text-center"
                                              style={{ display: "none" }}
                                          >
                                            Image not available
                                          </div>
                                        </div>
                                    ) : (
                                        <div className="aspect-[3/4] w-full mb-2 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs p-2 text-center">
                                          Image not available
                                        </div>
                                    )}

                                    <CardTitle className="text-base font-semibold line-clamp-2">
                                      {info.title || "Untitled"}
                                    </CardTitle>

                                    {info.authors && info.authors.length > 0 && (
                                        <CardDescription className="text-xs line-clamp-1">
                                          By {info.authors.join(", ")}
                                        </CardDescription>
                                    )}
                                  </CardHeader>

                                  <CardContent className="p-4 pt-0 flex-grow">
                                    <p className="text-xs text-muted-foreground line-clamp-4">
                                      {info.description || "No description available."}
                                    </p>
                                  </CardContent>

                                  <CardFooter className="p-4 pt-0 text-xs text-muted-foreground flex flex-col gap-2">
                                    {info.pageCount && (
                                        <span>{info.pageCount} pages</span>
                                    )}

                                    {(info.publishedDate || info.publisher) && (
                                        <span className="text-[11px] text-muted-foreground">
                              {info.publishedDate
                                  ? info.publishedDate
                                  : ""}{" "}
                                          {info.publisher
                                              ? ` • ${info.publisher}`
                                              : ""}
                            </span>
                                    )}

                                    {/* Remove from shelf button + status */}
                                    <div className="flex flex-col gap-1">
                                      <Button
                                          size="sm"
                                          variant="outline"
                                          className="w-full text-xs"
                                          disabled={isRemoving}
                                          onClick={() => removeBookFromShelf(vol.id)}
                                          title="Remove this book from the shelf"
                                      >
                                        {isRemoving ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : null}
                                        Remove from Shelf
                                      </Button>

                                      {removeMsg && (
                                          <span className="text-[11px] text-red-600">
                                {removeMsg}
                              </span>
                                      )}
                                    </div>
                                  </CardFooter>
                                </Card>
                            );
                          })}
                        </div>
                    )}
              </section>
          )}
        </main>

        {/* FOOTER */}
        <footer className="text-center mt-12 text-muted-foreground text-sm">
          Powered by Next.js, Shadcn UI, and Google Books API
        </footer>
      </div>
  );
}
