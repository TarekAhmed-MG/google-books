import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy - Definity AI",
    description: "Privacy Policy for Definity AI (personal project using Google Books).",
};

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-background text-foreground px-4 py-10 md:px-8">
            <div className="mx-auto max-w-3xl space-y-8">
                <header className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight">
                        Privacy Policy
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Last updated: {new Date().toLocaleDateString()}
                    </p>
                </header>

                <section className="space-y-4 text-sm leading-relaxed">
                    <p>
                        Definity AI is a personal project that lets you search books and manage
                        your own Google Books library.
                    </p>

                    <h2 className="text-base font-semibold mt-4">Data we access</h2>
                    <p>
                        When you sign in with Google, the app may access:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                        <li>Your basic profile (name, email, profile picture)</li>
                        <li>Your Google Books shelves and the books on those shelves</li>
                    </ul>
                    <p className="mt-2">
                        This uses Google OAuth scopes: <code>openid</code>,{" "}
                        <code>email</code>, <code>profile</code>, and{" "}
                        <code>https://www.googleapis.com/auth/books</code>.
                    </p>

                    <h2 className="text-base font-semibold mt-4">How we use your data</h2>
                    <ul className="list-disc list-inside space-y-1">
                        <li>To sign you in and show your profile in the app</li>
                        <li>To read your shelves and update them when you request actions (e.g. add/remove a book)</li>
                        <li>For basic logging and debugging (errors, performance)</li>
                    </ul>
                    <p className="mt-2">
                        We do <strong>not</strong> sell or share your data with third parties,
                        and we do not use it for advertising.
                    </p>

                    <h2 className="text-base font-semibold mt-4">Storage and retention</h2>
                    <p>
                        Tokens are used only to talk to Google APIs and validate your session.
                        Logs may be kept for a limited time for debugging and security.
                    </p>

                    <h2 className="text-base font-semibold mt-4">Contact</h2>
                    <p>
                        This is a personal project. If you have questions or want something
                        removed, contact:
                    </p>
                    <p className="mt-1">
                        <strong>Email:</strong> tarekcloud25@gmail.com
                    </p>
                </section>
            </div>
        </main>
    );
}
