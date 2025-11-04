import { useState, useEffect, useCallback } from "react";

// --- Types (from your page.tsx) ---
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
}
interface GoogleCodeClient {
    requestCode: () => void;
}

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
        // Wait for the GSI script to load (from layout.tsx)
        if (window.google?.accounts?.oauth2) {
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
                onError("Failed to initialize Google Login.");
            }
        }
        // We only re-run this if the GSI script object appears
    }, [clientId, onSuccess, onError, !!window.google?.accounts?.oauth2]);

    const startLogin = useCallback(() => {
        if (codeClient) {
            setIsLoading(true);
            codeClient.requestCode();
        } else {
            onError(
                "Login client not ready. Please wait a moment and try again."
            );
        }
    }, [codeClient, onError]);

    return { startLogin, isReady, isLoading };
}