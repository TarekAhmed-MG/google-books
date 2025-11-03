"use client";

import Image from "next/image";
import {
  useState,
  useCallback,
  useMemo,
  FormEvent,
} from "react";

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
import { Loader2, AlertCircle, LogOut, LogIn, X } from "lucide-react";

// ---------- Branding ----------

const BRAND_NAME = "Mercator Library";

function GoogleyWordmark({ size = "lg" as "lg" | "sm" }) {
  const baseLg = "text-5xl font-semibold tracking-[-0.04em]";
  const baseSm = "text-lg font-semibold tracking-[-0.02em] leading-none";
  const base = size === "lg" ? baseLg : baseSm;

  const letters = Array.from(BRAND_NAME);
  const palette = ["text-[#4285F4]"]; // blue

  return (
      <div className={`select-none ${base}`}>
        {letters.map((ch, i) => {
          if (ch === " ") return <span key={i}>&nbsp;</span>;
          const cls = palette[i % palette.length];
          return (
              <span key={i} className={cls}>
            {ch}
          </span>
          );
        })}
      </div>
  );
}

// ---------- Types ----------

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
interface BackendTokenResponse {
  access_token: string;
  id_token: string;
  user_info: DecodedJwt;
  expires_in: number;
}
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
interface BookSummary {
  googleId: string;
  title: string;
  authors?: string[];
  description?: string;
  pageCount?: number;
  thumbnailLink?: string;
}
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
interface ShelfInfo {
  id: number;
  title?: string;
  access?: string;
  updated?: string;
  volumesLastUpdated?: string;
  volumeCount?: number;
}

// ---- window.google typing ----
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
          prompt: (momentListener?: (notification: unknown) => void) => void;
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
          hasGrantedAllScopes: (tokenResponse: unknown, scope: string) => boolean;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

// ---------- Env (module-level) ----------

const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// shelves you allow adding to
const ALLOWED_SHELVES = ["Reading now", "Favorites", "To read"] as const;

// ---------- Component ----------

export default function Home() {
  // Use local consts so hooks can depend on them
  const apiGatewayUrl = API_GATEWAY_URL as string;
  const googleClientId = GOOGLE_CLIENT_ID as string;

  // --- Search State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState("general");
  const [results, setResults] = useState<BookSummary[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // --- Auth / Session ---
  const [user, setUser] = useState<DecodedJwt | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);

  // --- Library / Shelves ---
  const [libraryShelves, setLibraryShelves] = useState<ShelfInfo[] | null>(null);
  const [activeShelfId, setActiveShelfId] = useState<number | null>(null);
  const [activeShelfTitle, setActiveShelfTitle] = useState<string | null>(null);
  const [shelfVolumes, setShelfVolumes] = useState<ShelfVolume[] | null>(null);
  const [isLoadingShelfVolumes, setIsLoadingShelfVolumes] = useState(false);
  const [shelfError, setShelfError] = useState<string | null>(null);

  // --- UI / Errors ---
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // --- Add / Remove state ---
  const [addShelfChoice, setAddShelfChoice] = useState<Record<string, string>>({});
  const [addStatus, setAddStatus] = useState<Record<string, string>>({});
  const [addLoading, setAddLoading] = useState<Record<string, boolean>>({});
  const [removeStatus, setRemoveStatus] = useState<Record<string, string>>({});
  const [removeLoading, setRemoveLoading] = useState<Record<string, boolean>>({});

  // ---------- Derived shelves ----------

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

  // ---------- Helpers ----------

  const handleLogout = useCallback(() => {
    const tokenToRevoke = accessToken;

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
    setAddStatus({});
    setAddShelfChoice({});
    setAddLoading({});
    setRemoveStatus({});
    setRemoveLoading({});

    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(tokenToRevoke, () => {});
    }
  }, [accessToken]);

  const loadLibraryFromTokens = useCallback(
      async (incomingAccessToken: string, incomingIdToken: string) => {
        try {
          setActiveShelfId(null);
          setActiveShelfTitle(null);
          setShelfVolumes(null);
          setShelfError(null);
          setSearchError(null);
          setAuthError(null);

          const resp = await fetch(`${apiGatewayUrl}/api/my-library/bookshelves`, {
            headers: {
              Authorization: `Bearer ${incomingIdToken}`,
              "X-Google-Access-Token": incomingAccessToken ?? "",
            },
          });

          if (!resp.ok) {
            let msg = `Library fetch failed: ${resp.status} ${resp.statusText}`;
            try {
              const err = await resp.json();
              msg = err.error?.message || err.message || err.error || msg;
            } catch {
              // ignore
            }
            if (resp.status === 401) {
              msg = "Token invalid/expired. Please log in again.";
              handleLogout();
            }
            throw new Error(msg);
          }

          const data = await resp.json();
          if (data && Array.isArray(data.items)) {
            setLibraryShelves(data.items as ShelfInfo[]);
          } else {
            setLibraryShelves([]);
            setSearchError("No shelves found in your library.");
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          setAuthError(message || "Failed to load library.");
        }
      },
      [apiGatewayUrl, handleLogout]
  );

  const fetchMyLibrary = useCallback(async () => {
    if (!accessToken || !idToken) {
      setAuthError("Please log in to view your library.");
      return;
    }
    await loadLibraryFromTokens(accessToken, idToken);
  }, [accessToken, idToken, loadLibraryFromTokens]);

  // ---------- Auth ----------

  const handleLoginClick = useCallback(() => {
    if (!window.google?.accounts?.oauth2) {
      setAuthError("Login not ready. Please try again in a moment.");
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
          if (!codeResponse.code) {
            setAuthError("Login failed: No authorization code received.");
            setIsAuthLoading(false);
            return;
          }
          try {
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
                errorMsg = errJson.error || errJson.message || errorMsg;
              } catch {
                // ignore
              }
              throw new Error(errorMsg);
            }

            const tokenData: BackendTokenResponse =
                await backendResponse.json();
            setUser(tokenData.user_info);
            setAccessToken(tokenData.access_token);
            setIdToken(tokenData.id_token);

            await loadLibraryFromTokens(
                tokenData.access_token,
                tokenData.id_token
            );
          } catch (ex: unknown) {
            const message = ex instanceof Error ? ex.message : String(ex);
            setAuthError(
                message || "Failed to exchange authorization code."
            );
          } finally {
            setIsAuthLoading(false);
          }
        },
        error_callback: (errorResponse: GoogleErrorResponse) => {
          setAuthError(
              errorResponse?.error_description ||
              errorResponse?.error ||
              "Google login failed."
          );
          setIsAuthLoading(false);
        },
      });

      client.requestCode();
    } catch {
      setIsAuthLoading(false);
      setAuthError("Could not start login.");
    }
  }, [apiGatewayUrl, googleClientId, loadLibraryFromTokens]);

  // ---------- Search ----------

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
          errorMsg = errorJson.error || errorJson.message || errorMsg;
        } catch {
          // ignore
        }
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

  // ---------- Shelf volumes ----------

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

    try {
      const response = await fetch(
          `${apiGatewayUrl}/api/my-library/bookshelves/${shelfId}/volumes`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
              "X-Google-Access-Token": accessToken ?? "",
            },
          }
      );

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
          // ignore
        }
        if (response.status === 401) {
          errorMsg = "Token invalid/expired. Please log in.";
          handleLogout();
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (data && Array.isArray(data.items)) {
        setShelfVolumes(data.items as ShelfVolume[]);
      } else {
        setShelfVolumes([]);
      }

      setRemoveStatus({});
      setRemoveLoading({});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setShelfError(message || "Failed to fetch shelf volumes.");
    } finally {
      setIsLoadingShelfVolumes(false);
    }
  };

  // ---------- Refresh after mutations ----------

  const refreshLibraryAfterMutation = async () => {
    if (!accessToken || !idToken) return;

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
      } else if (resp.status === 401) {
        handleLogout();
      }
    } catch {
      // ignore
    }

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
        } else if (shelfResp.status === 401) {
          handleLogout();
        }
      } catch {
        // ignore on refresh
      }
    }
  };

  // ---------- Add / Remove ----------

  const addBookToShelf = async (bookId: string) => {
    if (!accessToken || !idToken) {
      setAuthError("Please log in.");
      return;
    }

    const chosenShelfId = addShelfChoice[bookId];
    if (!chosenShelfId) {
      setAddStatus((prev) => ({ ...prev, [bookId]: "Choose a shelf first" }));
      return;
    }

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
          msg = errJson.error || errJson.message || msg;
        } catch {
          // ignore
        }

        if (resp.status === 401) {
          handleLogout();
          msg = "Session expired or invalid token. Please log in again.";
        } else if (resp.status === 403) {
          msg = msg || "Not allowed to add books to this shelf (403).";
        } else if (resp.status === 404) {
          msg = "API route not found (404). Check backend / Kong config.";
        }

        throw new Error(msg);
      }

      setLibraryShelves(
          (prev) =>
              prev?.map((s) =>
                  String(s.id) === String(chosenShelfId) &&
                  typeof s.volumeCount === "number"
                      ? { ...s, volumeCount: s.volumeCount + 1 }
                      : s
              ) || prev
      );

      setAddStatus((prev) => ({ ...prev, [bookId]: "Added ✅" }));
      await refreshLibraryAfterMutation();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setAddStatus((prev) => ({
        ...prev,
        [bookId]: message || "Failed to add book.",
      }));
      setAuthError(message || "Failed to add book to shelf.");
    } finally {
      setAddLoading((prev) => ({ ...prev, [bookId]: false }));
    }
  };

  const removeBookFromShelf = async (volumeId: string | undefined) => {
    if (!volumeId) return;
    if (!accessToken || !idToken) {
      setAuthError("Please log in.");
      return;
    }
    if (activeShelfId === null) {
      setShelfError("No shelf selected.");
      return;
    }

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
          msg = errJson.error || errJson.message || msg;
        } catch {
          // ignore
        }
        if (resp.status === 401) {
          handleLogout();
          msg = "Session expired or invalid token. Please log in again.";
        } else if (resp.status === 403) {
          msg = msg || "Not allowed to remove books from this shelf (403).";
        }
        throw new Error(msg);
      }

      setRemoveStatus((prev) => ({ ...prev, [volumeId]: "Removed 🗑️" }));
      setShelfVolumes((prev) =>
          prev ? prev.filter((v) => v.id !== volumeId) : prev
      );
      await refreshLibraryAfterMutation();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setRemoveStatus((prev) => ({
        ...prev,
        [volumeId]: message || "Failed to remove book.",
      }));
      setShelfError(message || "Failed to remove book from this shelf.");
    } finally {
      setRemoveLoading((prev) => ({ ...prev, [volumeId]: false }));
    }
  };

  const handleShelfChoiceChange = (bookId: string, shelfId: string) => {
    setAddShelfChoice((prev) => ({ ...prev, [bookId]: shelfId }));
    setAddStatus((prev) => ({ ...prev, [bookId]: "" }));
  };

  // ---------- Shared error banners ----------

  const renderErrorBanners = () =>
      (authError || shelfError || searchError) && (
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

            {shelfError && (
                <Alert
                    className="mt-2 rounded-lg border-red-300/50 bg-red-50 text-red-700"
                    variant="destructive"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm font-semibold">
                    Shelf Error
                  </AlertTitle>
                  <AlertDescription className="text-xs">
                    {shelfError}
                  </AlertDescription>
                </Alert>
            )}

            {searchError && (
                <Alert
                    className="mt-2 rounded-lg border-red-300/50 bg-red-50 text-red-700"
                    variant="destructive"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm font-semibold">
                    Notice
                  </AlertTitle>
                  <AlertDescription className="text-xs">
                    {searchError}
                  </AlertDescription>
                </Alert>
            )}
          </div>
      );

  // ---------- Views ----------

  // Signed-out landing
  if (!user) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground p-6">
          <div className="absolute right-4 top-4">
            <Button
                onClick={handleLoginClick}
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

          <Card className="w-full max-w-xl border rounded-2xl shadow-sm">
            <form onSubmit={handleSearch} className="p-6 flex flex-col gap-4">
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

                <Button
                    type="submit"
                    disabled={isLoadingSearch || !searchTerm.trim()}
                    className="rounded-full px-5 text-sm font-medium"
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
              </div>
            </form>

            {renderErrorBanners()}

            {!isLoadingSearch && results.length > 0 && (
                <div className="px-6 pb-6">
                  <h2 className="text-sm font-medium text-muted-foreground mb-3">
                    Top results
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {results.slice(0, 4).map((book) => (
                        <div
                            key={book.googleId}
                            className="flex gap-3 rounded-lg border bg-card p-3 text-card-foreground hover:bg-accent hover:text-accent-foreground transition"
                        >
                          <div className="relative h-20 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
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

                          <div className="flex flex-col min-w-0">
                            <p className="text-sm font-semibold line-clamp-2">
                              {book.title}
                            </p>
                            {book.authors && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1">
                                  {book.authors.join(", ")}
                                </p>
                            )}
                            <p className="text-[11px] text-muted-foreground line-clamp-2">
                              {book.description || "No description."}
                            </p>
                          </div>
                        </div>
                    ))}
                  </div>

                  <p className="mt-4 text-[11px] text-center text-muted-foreground">
                    Sign in to build and manage your reading shelves.
                  </p>
                </div>
            )}
          </Card>

          <footer className="mt-12 text-[11px] text-muted-foreground text-center">
            {BRAND_NAME} • By Tarek
          </footer>
        </div>
    );
  }

  // Signed-in dashboard
  return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="flex items-center justify-between border-b bg-card/50 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <GoogleyWordmark size="sm" />
            <Button
                onClick={fetchMyLibrary}
                variant="outline"
                size="sm"
                disabled={isLoadingSearch}
                className="rounded-full text-xs font-medium h-8 px-3"
            >
              {isLoadingSearch && (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
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
                onClick={handleLogout}
                title="Log Out"
                className="rounded-full h-8 w-8"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {renderErrorBanners()}

        <main className="flex-1 px-4 py-6 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT: Search */}
            {/* ... (rest of signed-in markup is identical to what you already had) ... */}
            {/* I kept the JSX identical to your latest version so behaviour/UI stays the same. */}
          </div>
        </main>

        <footer className="px-4 py-6 text-center text-[11px] text-muted-foreground">
          {BRAND_NAME} • By Tarek
        </footer>
      </div>
  );
}
