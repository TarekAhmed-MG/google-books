'use client';

import Image from "next/image";
import { useState, FormEvent, useCallback } from "react";
import { jwtDecode } from "jwt-decode"; // kept in case you want to decode tokens client-side later

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
  access_token: string;   // Opaque Google access token (use to call Google Books API)
  id_token: string;       // Google ID token (JWT, used for Kong OIDC validation)
  user_info: DecodedJwt;  // Decoded ID token payload for display
  expires_in: number;
  // refresh_token?: string; // future enhancement if you handle refresh
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

// --- Component ---
export default function Home() {
  // --- Search State ---
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchType, setSearchType] = useState<string>("general");
  const [results, setResults] = useState<BookSummary[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // --- Auth / Session State ---
  const [user, setUser] = useState<DecodedJwt | null>(null);

  // accessToken: Google OAuth access token you use to call Google Books on behalf of the user
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // idToken: Google ID token (JWT) used purely so Kong's OIDC plugin will accept the request
  const [idToken, setIdToken] = useState<string | null>(null);

  // libraryShelves: data from GET /mylibrary/bookshelves via backend
  const [libraryShelves, setLibraryShelves] = useState<any[] | null>(null);

  // --- Auth flow UX state ---
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // --- Env / Config ---
  const apiGatewayUrl =
      process.env.NEXT_PUBLIC_API_GATEWAY_URL || "http://104.154.223.55";

  const googleClientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      "1033367449745-tgkqjo35chh3mqiprqqo8lfup01am8p6.apps.googleusercontent.com";

  // --- Login flow: popup -> code -> exchange via backend ---
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
            // Send auth code to backend (through Kong) to exchange for tokens
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
              } catch (e) {
                /* ignore parse error */
              }
              throw new Error(errorMsg);
            }

            const tokenData: BackendTokenResponse =
                await backendResponse.json();
            console.log("Received tokens from backend:", tokenData);

            // For UI
            setUser(tokenData.user_info);

            // For backend -> Google Books calls
            setAccessToken(tokenData.access_token);

            // For Kong OIDC validation at the gateway
            setIdToken(tokenData.id_token);
          } catch (exchangeError: any) {
            console.error("Error exchanging code:", exchangeError);
            setAuthError(
                exchangeError.message ||
                "Failed to exchange authorization code."
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

  // --- Logout: clear session, optionally revoke token with Google ---
  const handleLogout = () => {
    const tokenToRevoke = accessToken; // capture before clearing

    setUser(null);
    setAccessToken(null);
    setIdToken(null);
    setLibraryShelves(null);
    setAuthError(null);

    // Stop auto-selecting this account in future Google One Tap / GSI
    if (
        window.google &&
        window.google.accounts &&
        window.google.accounts.id
    ) {
      window.google.accounts.id.disableAutoSelect();
    }

    // Optional revoke of access token at Google
    if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(tokenToRevoke, () => {
        console.log("Google Access Token revoked.");
      });
    }

    console.log("User logged out");
  };

  // --- Book Search (public-ish / no auth headers) ---
  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoadingSearch(true);
    setSearchError(null);
    setResults([]);
    // when starting a search, we aren't clearing shelves; shelves belongs to auth

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
        } catch (e) {
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

  // --- Fetch My Library Shelves (protected via Kong OIDC) ---
  const fetchMyLibrary = async () => {
    // We require BOTH:
    // - idToken: JWT that Kong's openid-connect plugin will verify
    // - accessToken: opaque Google OAuth access token for calling Google Books from backend
    if (!accessToken || !idToken) {
      setAuthError("Please log in to view your library.");
      return;
    }

    setIsLoadingSearch(true);
    setSearchError(null);
    setAuthError(null);

    const myLibraryUrl = `${apiGatewayUrl}/api/my-library/bookshelves`;

    try {
      const response = await fetch(myLibraryUrl, {
        headers: {
          // Kong OIDC plugin validates THIS
          Authorization: `Bearer ${idToken}`,

          // Backend uses THIS to call Google Books API on behalf of the user
          "X-Google-Access-Token": accessToken ?? "",
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
        } catch (e) {
          /* ignore parse error */
        }

        if (response.status === 401 || response.status === 403) {
          // 401/403 here means:
          // - Kong rejected the id_token (expired / invalid), OR
          // - backend couldn't use accessToken (Google said token expired)
          errorMsg =
              "Authentication failed or token invalid/expired. Please log in again.";
          handleLogout();
        }

        throw new Error(errorMsg);
      }

      const libraryData = await response.json();
      console.log("My Library Data:", libraryData);

      // Google Books API for /mylibrary/bookshelves returns:
      // { kind: "...", items: [ { id, title, volumeCount, ... }, ... ] }
      if (libraryData && Array.isArray(libraryData.items)) {
        setLibraryShelves(libraryData.items);
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

  // --- Render ---
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
                <div className="flex items-center gap-4">
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
                    <p className="text-xs text-muted-foreground">{user.email}</p>
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
            )}
          </div>
        </header>

        {/* AUTH / ACCESS ERRORS */}
        {authError && (
            <Alert
                className="w-full max-w-2xl mx-auto mb-4"
                variant="destructive"
            >
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
          {/* GLOBAL BUSY SPINNER */}
          {isLoadingSearch && (
              <div className="flex justify-center items-center mt-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading...</span>
              </div>
          )}

          {/* ERRORS / NOTICES */}
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
                        : "Enter a search term or view your library if logged in."}
                  </p>
              )}

          {/* SEARCH RESULTS GRID */}
          {!isLoadingSearch && !searchError && results.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center justify-between">
                  <span>Search Results</span>
                  <span className="text-sm text-muted-foreground">
                {results.length} result{results.length === 1 ? "" : "s"}
              </span>
                </h2>

                <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {results.map((book) => (
                      <Card
                          key={book.googleId}
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

                        <CardFooter className="p-4 pt-0 text-xs text-muted-foreground">
                          {book.pageCount ? `${book.pageCount} pages` : ""}
                        </CardFooter>
                      </Card>
                  ))}
                </div>
              </section>
          )}

          {/* USER'S SHELVES GRID (AFTER "View My Library") */}
          {!isLoadingSearch && libraryShelves && (
              <section className="mt-12">
                <h2 className="text-xl font-semibold mb-4 flex items-center justify-between">
                  <span>Your Google Books Shelves</span>
                  <span className="text-sm text-muted-foreground">
                {libraryShelves.length} shelf
                    {libraryShelves.length === 1 ? "" : "s"}
              </span>
                </h2>

                {libraryShelves.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center">
                      You don't have any shelves yet.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {libraryShelves.map((shelf: any) => (
                          <Card key={shelf.id} className="flex flex-col">
                            <CardHeader className="p-4 pb-2">
                              <CardTitle className="text-base font-semibold line-clamp-1">
                                {shelf.title || "Untitled Shelf"}
                              </CardTitle>

                              <CardDescription className="text-xs text-muted-foreground flex flex-col">
                                {shelf.volumeCount != null && (
                                    <span>
                            {shelf.volumeCount} book
                                      {shelf.volumeCount === 1 ? "" : "s"}
                          </span>
                                )}

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
                                  disabled
                                  title="TODO: Fetch volumes on this shelf next"
                              >
                                View Shelf #{shelf.id}
                              </Button>
                            </CardFooter>
                          </Card>
                      ))}
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
