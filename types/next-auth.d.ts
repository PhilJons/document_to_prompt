import NextAuth, { DefaultSession, DefaultUser, Profile } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's id from your database. */
      id: string;
    } & DefaultSession["user"]; // Inherit other properties from DefaultSession
  }

  // Interface to add custom properties to the User object (e.g. from provider's profile callback)
  interface User extends DefaultUser {
    // id is already part of DefaultUser as string
    // Add any other custom properties you might map from the provider profile
  }

  // Augment the Profile type from Azure AD to include oid
  interface Profile {
    oid?: string;
    // Add other Azure AD specific claims you might need
    preferred_username?: string;
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT extends DefaultJWT {
    /** OpenID ID Token */
    userId?: string;
    azureOid?: string; // Added this from your previous code
    // Add any other custom claims you want to persist in the JWT
  }
} 