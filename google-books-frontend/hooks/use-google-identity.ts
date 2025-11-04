import { useState, useEffect, useCallback } from "react";

// --- Import the types from our definitions file ---
import type {
    GoogleCodeResponse,
    GoogleErrorResponse,
    GoogleCodeClient
} from "@/types/google-gsi";

// --- Hook Props ---
interface UseGoogleIdentityProps {
    clientId: string;
    onSuccess: (codeResponse: GoogleCodeResponse) => void;
    onError: (errorMsg: string) => void;
}

export function useGoogleIdentity({
                                      clientId,
                                      onSuccess,
                                      onError,
                                  }: UseGoogleIdentityProps) {
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [codeClient, setCodeClient] = useState<GoogleCodeClient | null>(null);

    useEffect(() => {
        const isClient = typeof window !== "undefined";

        // Only run this logic on the client
        if (isClient) {
            // We check for the google object on a timer, as it might load after this hook
            const intervalId = setInterval(() => {
                if (window.google?.accounts?.oauth2) {
                    clearInterval(intervalId); // Stop checking once it's found
                    try {
                        const client = window.google.accounts.oauth2.initCodeClient({
                            client_id: clientId,
                            scope: [
                                "openid",
                                "email",
                                "profile",
                                "https://www.googleapis.com/auth/books",
                            ].join(" "),
                            ux_mode: "popup",
                            callback: (codeResponse) => {
                                setIsLoading(false);
                                if (codeResponse.code) {
                                    onSuccess(codeResponse);
                                } else {
                                    onError("Google login failed: No authorization code received.");
                                }
                            },
                            error_callback: (errorResponse: GoogleErrorResponse) => {
                                setIsLoading(false);
                                onError(
                                    errorResponse?.error_description ||
                                    errorResponse?.error ||
                                    "Google login failed."
                                );
                            },
                        });
                        setCodeClient(client);
                        setIsReady(true);
                    } catch (err) {
                        // --- FIX: Fail silently on init ---
                        // Instead of calling onError, just log it.
                        // This stops the red error box from appearing on load.
                        console.error("Failed to initialize Google Login:", err);
                        // onError("Failed to initialize Google Login."); // <-- We removed this line
                    }
                }
            }, 100); // Check every 100ms

            // Cleanup interval on unmount
            return () => clearInterval(intervalId);
        }
    }, [clientId, onSuccess, onError]); // Rerun if any of these props change

    const startLogin = useCallback(() => {
        if (codeClient) {
            setIsLoading(true);
            codeClient.requestCode();
        } else {
            // This will now be the *first* time the user sees an error, which is correct.
            onError(
                "Login client not ready. Please wait a moment and try again."
            );
        }
    }, [codeClient, onError]);

    return { startLogin, isReady, isLoading };
}