// --- Types for Google Sign-In (GSI) Client ---
// We EXPORT these so they can be imported elsewhere.

export interface GoogleCodeResponse {
    code: string;
    scope: string;
    authuser: string;
    prompt: string;
    state?: string;
}

export interface GoogleErrorResponse {
    type: string;
    error?: string;
    error_description?: string;
}

export interface GoogleCodeClient {
    requestCode: () => void;
}

export interface GoogleCodeClientConfig {
    client_id: string;
    scope: string;
    ux_mode: "popup" | "redirect";
    callback: (response: GoogleCodeResponse) => void;
    error_callback: (error: GoogleErrorResponse) => void;
}

// --- Global Augmentation for window.google ---
// This remains the same. "export {}" makes this file a module,
// which is required for 'declare global' to work correctly.
export {};

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    disableAutoSelect: () => void;
                };
                oauth2: {
                    initCodeClient: (config: GoogleCodeClientConfig) => GoogleCodeClient;
                    revoke: (token: string, callback: () => void) => void;
                };
            };
        };
    }
}