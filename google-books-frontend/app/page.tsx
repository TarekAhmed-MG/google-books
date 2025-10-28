'use client';

import Image from "next/image";
import { useState, FormEvent, useEffect, useRef, useCallback } from "react";
import { jwtDecode } from 'jwt-decode';

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

// --- Google Types ---
interface GoogleCredentialResponse { // From GSI Button (ID Token only) - kept for reference
  credential?: string;
  select_by?: string;
}

// Interface for the token response we expect from our backend exchange
interface BackendTokenResponse {
  access_token: string;
  id_token: string; // The original ID token JWT
  user_info: DecodedJwt; // Decoded ID token payload
  expires_in: number;
  // Potentially refresh_token if backend sends it (handle securely!)
}

// Keep DecodedJwt interface
interface DecodedJwt {
  iss: string; azp: string; aud: string; sub: string; email: string;
  email_verified: boolean; nbf: number; name: string; picture: string;
  given_name: string; family_name: string; iat: number; exp: number; jti: string;
}

// --- Book Summary Interface ---
interface BookSummary {
  googleId: string; title: string; authors?: string[]; description?: string;
  pageCount?: number; thumbnailLink?: string;
}

// --- Global Type Declaration ---
declare global {
  interface Window {
    google?: {
      accounts: {
        id: { // Keep ID methods if using GSI button elsewhere or for future use
          initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; ux_mode?: string }) => void;
          renderButton: (parent: HTMLElement, options: { theme?: string; size?: string; type?: string; shape?: string; text?: string; width?: string; logo_alignment?: string }) => void;
          prompt: (momentListener?: (notification: any) => void) => void;
          disableAutoSelect: () => void;
        };
        oauth2: { // Add the oauth2 namespace
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup' | 'redirect';
            redirect_uri?: string; // Needed for redirect mode
            callback?: (codeResponse: GoogleCodeResponse) => void; // Used in popup mode
            error_callback?: (errorResponse: GoogleErrorResponse) => void; // Added error callback
            state?: string;
            enable_granular_consent?: boolean;
          }) => GoogleCodeClient;
          hasGrantedAllScopes: (tokenResponse: any, scope: string) => boolean;
          revoke: (token: string, done: () => void) => void; // Add revoke method
        };
      };
    };
  }
}
// Specific types for code flow
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


// --- Component ---
export default function Home() {
  // --- Search State ---
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchType, setSearchType] = useState<string>("general");
  const [results, setResults] = useState<BookSummary[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // --- Auth State ---
  const [user, setUser] = useState<DecodedJwt | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const googleClientId = "432449136597-b79cre253mc9pcpfjopv0mr5r22m9mlq.apps.googleusercontent.com"; // Your Client ID

  // --- Google Auth Code Client Trigger ---
  const handleLoginClick = useCallback(() => {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      console.error("Google OAuth2 client not loaded");
      setAuthError("Google Login library not ready. Please try again in a moment.");
      return;
    }
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      // Initialize Code Client for Auth Code flow
      const client = window.google.accounts.oauth2.initCodeClient({
        client_id: googleClientId,
        scope: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/books'
        ].join(' '),
        ux_mode: 'popup',
        callback: async (codeResponse) => {
          console.log("Received auth code response:", codeResponse);
          if (codeResponse.code) {
            try {
              const backendResponse = await fetch('http://localhost:9000/api/auth/google/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: codeResponse.code })
              });

              if (!backendResponse.ok) {
                let errorMsg = `Code exchange failed: ${backendResponse.statusText}`;
                try { const errJson = await backendResponse.json(); errorMsg = errJson.error || errorMsg; } catch (e) {}
                throw new Error(errorMsg);
              }

              const tokenData: BackendTokenResponse = await backendResponse.json();
              console.log("Received tokens from backend:", tokenData);
              setUser(tokenData.user_info);
              setAccessToken(tokenData.access_token);

            } catch (exchangeError: any) {
              console.error("Error exchanging code:", exchangeError);
              setAuthError(exchangeError.message || "Failed to exchange authorization code.");
            } finally {
              setIsAuthLoading(false);
            }
          } else {
            console.error("No authorization code received from Google.");
            setAuthError("Login failed: No authorization code received.");
            setIsAuthLoading(false);
          }
        },
        error_callback: (errorResponse: GoogleErrorResponse) => {
          console.error('Google Auth Code Error:', errorResponse);
          setAuthError(errorResponse?.error_description || errorResponse?.error || 'Google login failed.');
          setIsAuthLoading(false);
        }
      });
      client.requestCode();
    } catch (initError) {
      console.error("Error initializing Google Code Client:", initError);
      setAuthError("Could not start Google login process.");
      setIsAuthLoading(false);
    }
  }, []);


  // --- Handle Logout ---
  const handleLogout = () => {
    const tokenToRevoke = accessToken; // Capture token before clearing state
    setUser(null);
    setAccessToken(null);
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    // Optionally revoke the token on Google's side
    if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(tokenToRevoke, () => {
        console.log('Google Access Token revoked.');
      });
    }
    console.log("User logged out");
  };


  // --- Handle Search (Fetch Function) ---
  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoadingSearch(true);
    setSearchError(null);
    setResults([]);
    const apiUrl = `http://localhost:9000/api/books/search?term=${encodeURIComponent(searchType)}&search=${encodeURIComponent(searchTerm)}`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        let errorMsg = `Search Error: ${response.status} ${response.statusText}`;
        try { const errorJson = await response.json(); errorMsg = errorJson.error || errorMsg; } catch (e) {}
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

  // --- Example Function to Fetch My Library (Protected) ---
  const fetchMyLibrary = async () => {
    if (!accessToken) {
      setAuthError("Please log in to view your library."); // Use authError for login issues
      return;
    }
    setIsLoadingSearch(true);
    setSearchError(null); // Clear search errors specifically
    setAuthError(null);   // Clear auth errors
    setResults([]);

    // URL points to your Kong Gateway
    const myLibraryUrl = 'http://localhost:8000/api/my-library/bookshelves';

    try {
      const response = await fetch(myLibraryUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        let errorMsg = `Library fetch failed: ${response.status} ${response.statusText}`;
        try { const errJson = await response.json(); errorMsg = errJson.error?.message || errJson.message || errJson.error || errorMsg; } catch(e){}
        if (response.status === 401 || response.status === 403) {
          errorMsg = "Authentication failed or token invalid/expired. Please log in again.";
          // Force logout if token is rejected
          handleLogout();
        }
        throw new Error(errorMsg);
      }

      const libraryData = await response.json();
      console.log("My Library Data:", libraryData);
      // TODO: Implement display logic for library data
      setSearchError("Successfully fetched library data (check console). Display logic needed.");

    } catch (err: any) {
      console.error("Error fetching library:", err);
      // Show library-specific errors using the authError state
      setAuthError(err.message || "Failed to fetch library.");
    } finally {
      setIsLoadingSearch(false);
    }
  };

  // --- Render ---
  return (
      <div className="container mx-auto font-sans p-4 sm:p-8 min-h-screen flex flex-col">
        <header className="text-center my-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-bold">Google Books Search</h1>
          {/* --- Auth Section --- */}
          <div className="auth-section">
            {!user && (
                <Button onClick={handleLoginClick} disabled={isAuthLoading}>
                  {isAuthLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <LogIn className="mr-2 h-4 w-4" /> Sign in with Google
                </Button>
            )}
            {user && (
                <div className="flex items-center gap-4">
                  <Button onClick={fetchMyLibrary} variant="outline" disabled={isLoadingSearch}>
                    {/* Show loader only if loading *library* data */}
                    {isLoadingSearch && results.length === 0 && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    View My Library
                  </Button>
                  <div className="text-right">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  {user.picture && (
                      // Add configuration in next.config.js for googleusercontent.com if needed
                      <Image src={user.picture} alt="User profile" width={40} height={40} className="rounded-full" />
                  )}
                  <Button variant="outline" size="icon" onClick={handleLogout} title="Log Out">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
            )}
          </div>
        </header>
        {/* Display Auth Errors */}
        {authError && (
            <Alert variant="destructive" className="w-full max-w-2xl mx-auto mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Login/Access Error</AlertTitle>
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
        )}

        {/* --- Search Form --- */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 w-full max-w-2xl mx-auto items-center mb-8">
          <Select value={searchType} onValueChange={setSearchType}>
            <SelectTrigger className="w-full sm:w-[120px]"> <SelectValue placeholder="Type" /> </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="intitle">Title</SelectItem>
              <SelectItem value="inauthor">Author</SelectItem>
            </SelectContent>
          </Select>
          <Input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for books..." required className="flex-grow"
          />
          <Button type="submit" disabled={isLoadingSearch || !searchTerm.trim()} className="w-full sm:w-auto">
            {isLoadingSearch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoadingSearch ? "Searching..." : "Search"}
          </Button>
        </form>

        {/* --- Main Content Area --- */}
        <main className="flex-grow w-full max-w-5xl mx-auto">
          {/* Loading Indicator for Search */}
          {isLoadingSearch && (
              <div className="flex justify-center items-center mt-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading...</span>
              </div>
          )}

          {/* Search Error Display */}
          {searchError && !isLoadingSearch && (
              <Alert variant="destructive" className="w-full max-w-2xl mx-auto mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Search Notice</AlertTitle>
                <AlertDescription>{searchError}</AlertDescription>
              </Alert>
          )}

          {/* Initial / No Search Results Message */}
          {!isLoadingSearch && !searchError && results.length === 0 && !authError && ( // Hide if there's an auth error
              <p className="text-center text-muted-foreground mt-10">
                {searchTerm && !isLoadingSearch ? "No books found." : "Enter a search term or view your library if logged in."}
              </p>
          )}

          {/* Search Results Grid */}
          {!isLoadingSearch && !searchError && results.length > 0 && (
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {results.map((book) => (
                    <Card key={book.googleId} className="flex flex-col overflow-hidden">
                      <CardHeader className="p-4">
                        {book.thumbnailLink ? (
                            <div className="relative aspect-[3/4] w-full mb-2 bg-muted rounded-md overflow-hidden">
                              <Image
                                  src={book.thumbnailLink.replace(/^http:/, 'https:')}
                                  alt={`Cover of ${book.title}`}
                                  fill
                                  sizes="(max-width: 640px) 90vw, (max-width: 768px) 45vw, (max-width: 1024px) 30vw, 23vw"
                                  style={{ objectFit: 'contain' }}
                                  className="transition-opacity opacity-0 duration-500"
                                  onLoadingComplete={(image) => image.classList.remove('opacity-0')}
                                  unoptimized={book.thumbnailLink.includes('googleusercontent.com')}
                                  onError={(e) => {
                                    const parentDiv = e.currentTarget.closest('div');
                                    if (parentDiv) parentDiv.style.display = 'none';
                                    const cardHeader = e.currentTarget.closest('.p-4');
                                    const placeholder = cardHeader?.querySelector('.image-placeholder-fallback') as HTMLElement | null;
                                    if (placeholder) placeholder.style.display = 'flex';
                                  }}
                              />
                              <div className="image-placeholder-fallback absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs p-2 text-center" style={{ display: 'none' }}>
                                Image not available
                              </div>
                            </div>
                        ) : (
                            <div className="aspect-[3/4] w-full mb-2 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs p-2 text-center">
                              Image not available
                            </div>
                        )}
                        <CardTitle className="text-base font-semibold line-clamp-2">{book.title}</CardTitle>
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
          )}
        </main>

        {/* --- Footer --- */}
        <footer className="text-center mt-12 text-muted-foreground text-sm">
          Powered by Next.js, Shadcn UI, and Google Books API
        </footer>
      </div>
  );
}