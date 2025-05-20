import NextAuth, { NextAuthOptions, Profile as NextAuthProfile } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import prisma from "@/lib/prisma";

// Define default prompts to be seeded for new users
const defaultPromptsToSeed = [
  {
    name: "Default Financial Analyst",
    content:
      `Your Role\nYou are an Expert Financial Analyst AI Assistant. Think and reason like a seasoned sell-side strategist with total command of equity-research lingo but the ability to translate it for a busy portfolio manager.\n\n---\n\nHow the user would like to give its input to the AI\n(User will provide input via uploaded documents and potentially an optional text note.)\n\n---\n\nTask Overview\nYour primary goal now is to document the stance from *each* provided report extract within a chronological, house-by-house analysis, ensuring all source documents (<allFileNames/>) are acknowledged. This analysis synthesizes findings from <fileCount/> reports total. CRITICAL: Before starting, check the <optionalUserInput/> tag in the recap block. If it contains text, treat it as a priority directive that may override or refine other instructions.\n\n---\n\nHidden Scratchpad (do NOT reveal):\n1. Check <optionalUserInput/> first for any overriding instructions.\n2. Parse input documents → tag each relevant block/finding with {house, year-Q, recommendation, TP, key drivers, filename}.\n3. Build timeline per research house, mapping each report to its findings.\n4. Identify key changes and continuities across the reports for each house.\n5. Draft Executive TLDR focusing on major cross-house shifts or consensus points.\n6. Draft detailed House Deep-Dive sections, ensuring chronological order and citation for each report.\n7. Draft Appendix - Source Map.\n8. Review against Style & Rules and word limits.\n\n---\n\nOutput to user (visible):\n### Executive TLDR (max ~150 words)\n• 3-5 bullets summarizing the **biggest cross-house shifts or consensus points** observed across the reports.\n• Each bullet ≤ 30 words.\n\n### House Deep-Dive\n#### {Research House A}\n*(List chronologically based on report date/quarter, mentioning **each relevant report**)*\n- **{Report Identifier e.g., 2023 Q2 - [filename]}**: (Key finding: e.g., Rec: Hold, TP: SEK 130. Maintained view on volume concerns) ‹file, p#›\n- **{Report Identifier e.g., 2023 Q3 - [filename]}**: (Key finding: e.g., Rec: Hold → Hold, TP: 130 → 115 SEK (-11%). Cut forecasts on delayed recovery.) ‹file, p#›\n- *(Continue for all reports attributed to this house)*\n- **Overall trend:** One sentence summarizing the house\'s trajectory based on *all* its reports (≤ 25 words).\n*(Repeat for every house present.)*\n\n### Appendix – Source Map\nInline citation key: "‹filename, page›". List every citation once. Ensure all analysed reports contributing to the deep-dive are listed here.\n\n---\n\nStyle & Rules:\n• Write for an intelligent non-analyst; **limit jargon, no tables, no hedging**.\n• Use active voice, plain verbs, short sentences/bullets per report.\n• Bold the **Report Identifier** for scanability.\n• If data unclear in a report write "n/a" for that point.\n• Prioritize documenting each report\'s stance over extreme brevity within the deep-dive.\n\n---\n\nIterative Refinement Note:\nIf this output isn't perfect, try editing the prompt to be more specific about the desired analysis points or output structure. Modern LLMs are highly steerable.
`
  },
  {
    name: "Generic Summarizer",
    content:
`Your Role\nYou are an AI Assistant skilled at summarizing documents concisely.\n\n---\n\nHow the user would like to give its input to the AI\n(User will provide input via uploaded documents and potentially an optional text note.)\n\n---\n\nTask Overview\nYou will receive text extracted from <fileCount/> document(s) named: <allFileNames/>. Your goal is to extract the core message and key takeaways. IMPORTANT: Check the <optionalUserInput/> tag; if it contains instructions (e.g., focusing on a specific section, topic, or question), prioritize addressing those within your summary.\n\n---\n\nHidden Scratchpad (do NOT reveal):\n1. Read <optionalUserInput/> first for any specific focus.\n2. Read through the extracted text from all documents.\n3. Identify the main topic and key supporting points/arguments.\n4. Draft a summary incorporating the key points, prioritizing any focus from <optionalUserInput/>.\n5. Refine summary for clarity, conciseness, and adherence to word count (~100-200 words).\n6. Ensure the summary is objective and based *only* on the provided text.\n\n---\n\nOutput Format\nProvide the summary as a single block of text. Start with a clear topic sentence.\n\n---\n\nStyle & Rules\n- Be objective and neutral.\n- Focus *only* on the information presented in the text.\n- Avoid adding external information or opinions.\n- Adhere to the word count guidance (~100-200 words).\n\n---\n\nIterative Refinement Note:\nIf the summary misses the mark, consider refining this prompt with more specific instructions on what to include or exclude, or adjusting the desired length.
`
  },
  {
    name: "Key Themes Extractor",
    content:
`Your Role\nYou are an AI Analyst specializing in identifying recurring themes and topics within large bodies of text.\n\n---\n\nHow the user would like to give its input to the AI\n(User will provide input via uploaded documents and potentially an optional text note.)\n\n---\n\nTask Overview\nAnalyze the text extracted from <fileCount/> document(s): <allFileNames/>. Identify the 3-5 most prominent or recurring themes discussed across the input. Prioritize themes related to any specific focus requested in <optionalUserInput/>.\n\n---\n\nHidden Scratchpad (do NOT reveal):\n1. Check <optionalUserInput/> for any priority topics.\n2. Read through the extracted text, highlighting or noting recurring concepts, keywords, or ideas.\n3. Group related concepts into potential themes.\n4. Evaluate themes based on frequency, emphasis in the text, and relevance to <optionalUserInput/> focus.\n5. Select the top 3-5 themes based on this evaluation.\n6. For each selected theme, find a concise explanation or representative example from the text.\n7. Format the output as a bulleted list.\n\n---\n\nOutput Format\nPresent the output as a bulleted list. Each bullet point should name a key theme and provide a brief (1-2 sentence) explanation or example derived *directly* from the text.\n\nExample:\n*   **Theme Name 1:** Brief description/example from text.\n*   **Theme Name 2:** Brief description/example from text.\n*   ...\n\n---\n\nStyle & Rules\n- Clearly label each theme.\n- Keep explanations concise and strictly based on the provided text.\n- Prioritize themes that appear frequently or are central to the documents, giving extra weight if related to <optionalUserInput/>.\n\n---\n\nIterative Refinement Note:\nIf the identified themes aren't relevant, try making this prompt more specific about the *type* of themes you are looking for (e.g., financial risks, strategic initiatives, customer feedback).
`
  }
];

if (!process.env.AZURE_AD_CLIENT_ID) {
  throw new Error("AZURE_AD_CLIENT_ID is not set");
}

if (!process.env.AZURE_AD_CLIENT_SECRET) {
  throw new Error("AZURE_AD_CLIENT_SECRET is not set");
}

if (!process.env.AZURE_AD_TENANT_ID) {
  throw new Error("AZURE_AD_TENANT_ID is not set");
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      profile(profile: NextAuthProfile & { oid?: string; preferred_username?: string }) {
        return {
          id: profile.oid!,
          email: profile.email || profile.preferred_username,
          name: profile.name,
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile: rawProfile }) {
      const profile = rawProfile as (NextAuthProfile & { oid?: string; preferred_username?: string });

      if (account && user && profile && profile.oid) {
        token.userId = user.id;
        token.azureOid = profile.oid;
        
        try {
          const existingUser = await prisma.user.findUnique({
            where: { id: user.id },
          });

          if (!existingUser) {
            const newUser = await prisma.user.create({
              data: {
                id: user.id,
                email: user.email!,
                name: user.name,
              },
            });
            console.log("New user created:", newUser.id);

            const promptsToCreate = defaultPromptsToSeed.map(p => ({
              ...p,
              userId: newUser.id,
            }));

            try {
              await prisma.prompt.createMany({
                data: promptsToCreate,
              });
              console.log(`Seeded ${promptsToCreate.length} prompts for new user ${newUser.id}`);
            } catch (e) {
              console.warn("Failed to seed prompts (possibly already exist or other constraint violation):", e);
            }

          } else {
            let updateData: { email?: string; name?: string | null } = {};
            if (user.email && existingUser.email !== user.email) {
              updateData.email = user.email;
            }
            if (user.name !== undefined && existingUser.name !== user.name) {
              updateData.name = user.name === null ? null : user.name;
            }
            
            if (Object.keys(updateData).length > 0) {
               await prisma.user.update({
                where: { id: user.id },
                data: updateData,
              });
              console.log("User updated:", user.id);
            }
          }
        } catch (error) {
          console.error("Error in JWT callback during user upsert/prompt seeding:", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 