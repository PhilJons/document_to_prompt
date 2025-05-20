import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

// The entire authOptions definition, including defaultPromptsToSeed, 
// AzureADProvider, prisma, and all callbacks, should now be in lib/authOptions.ts
// This file should only contain the lines below:

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 