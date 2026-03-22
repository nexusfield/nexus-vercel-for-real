import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { NextResponse } from "next/server";

// Set NEXTAUTH_URL dynamically for local development vs Vercel deployments.
// - Vercel provides VERCEL_URL without protocol.
// - Locally, Nexus runs on http://localhost:3000.
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      // Allow /login, /api/auth/*, and one-time re-embed without session
      if (
        pathname === "/login" ||
        pathname.startsWith("/api/auth/") ||
        pathname === "/api/admin/reembed" ||
        pathname.startsWith("/api/knowledge-folders")
      ) {
        return true;
      }
      // Require session for all other routes
      if (auth?.user) return true;
      return NextResponse.redirect(new URL("/login", request.url));
    },
  },
  pages: {
    signIn: "/login",
  },
});
