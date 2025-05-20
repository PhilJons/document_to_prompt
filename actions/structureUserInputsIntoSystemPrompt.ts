'use server';

import { azure } from "@ai-sdk/azure";
import { generateText, CoreMessage } from "ai";

export async function structureUserInputsIntoSystemPromptAction(
  userInputs: string // The user's raw thoughts/dump
): Promise<{ success: boolean; structuredPrompt?: string; error?: string }> {
  const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME; // Or your preferred model

  if (!openaiDeployment) {
    console.error("Missing Azure OpenAI deployment name for structuring prompt.");
    return { success: false, error: "Configuration error for AI-assisted prompt structuring." };
  }

  // The meta-prompt that instructs the LLM how to transform user inputs
  // into a world-class system prompt.
  const metaPrompt = `
You are an expert AI Prompt Engineer. Your task is to transform the user's raw input notes into a comprehensive, well-structured, and highly effective system prompt.
This system prompt will be used to guide another AI to perform a task.

The final generated system prompt should incorporate the following best practices:
1.  **Role Definition:** Clearly define an appropriate role for the AI that will execute the prompt. Infer this from the user's task definition.
2.  **Context & Task:** Clearly state the context, incorporate any background information provided by the user, and define the primary task or goal.
3.  **Audience:** Specify the target audience if the user mentioned it.
4.  **How User Will Provide Input:** Include a section like "--- How the user would like to give its input to the AI ---" and provide a placeholder or general instruction based on the user's notes (e.g., "(User will provide input via uploaded documents)", "(User will paste text directly)"). If not specified, include a generic placeholder like "(Specify how input will be provided)".
5.  **Referencing Runtime Data:** Throughout the prompt you generate, you can reference runtime data using specific XML-style tags: <fileCount/> (for the number of documents), <allFileNames/> (for a comma-separated list of document names), and <optionalUserInput/> (for any ad-hoc note provided by the user at runtime). Use these tags where it would be contextually helpful for the AI performing the analysis. For example, you might instruct the AI to cite sources using <allFileNames/> or to pay special attention to <optionalUserInput/> if the user's notes indicate its importance.
6.  **Guidance on <optionalUserInput/>**: If the user's input in the 'How the user would like to give its input to the AI' section (or any other section) implies that the <optionalUserInput/> is of high importance or contains critical instructions, ensure your generated prompt explicitly guides the main AI to prioritize or heavily weigh the content of <optionalUserInput/>. For instance: "Carefully review the <optionalUserInput/> section first; it contains priority directives for this task."
7.  **Output Structure:** Detail the desired output format, structure, or examples if the user provided them.
8.  **Hidden Scratchpad / Chain of Thought:** Include a section like "Hidden Thought Process (do NOT reveal):" or "Thought Process:" to guide the AI's internal planning. This should outline a logical series of steps the AI might take.
9.  **Style & Rules / What Not To Do:** Include general best practices (e.g., be clear, concise, avoid jargon if the audience is non-technical) and any specific constraints or "what not to do" items derivable from the user's input.
10. **Limits:** If the task suggests quantitative output or specific length constraints, include them.
11. **Iterative Refinement Note:** Optionally, include a small note at the end about how the user can further refine the prompt by being more specific if the AI's output isn't perfect, referencing the steerability of modern LLMs.

**Important Note on Runtime Information:**
The system you are generating this prompt for will automatically append a section at the END of this prompt (after all your generated content) called "--- Contextual Information Recap ---". This recap section will provide the actual values for <fileCount/>, <allFileNames/>, and <optionalUserInput/>.
Therefore, **DO NOT insert any actual data or values for these tags yourself**. Your role is to correctly *reference these tags by name* (e.g., <fileCount/>, <optionalUserInput/>) within the body of the prompt you are generating, where it makes sense for the AI that will execute this prompt. Do not create the "--- Contextual Information Recap ---" section yourself; it will be added by the runtime.

User's Raw Input Notes:
---
${userInputs}
---

Based on these notes, generate ONLY the full system prompt content. Do not add any conversational fluff before or after the generated prompt.
The generated prompt should be ready to be used directly.
Ensure you use the XML-style tags <fileCount/>, <allFileNames/>, and <optionalUserInput/> where appropriate, and do not attempt to fill them with data.
`;

  try {
    const { text: structuredPrompt } = await generateText({
      model: azure(openaiDeployment), // Or your preferred AI SDK model
      // No system prompt for this meta-generation task, the user prompt is highly directive.
      prompt: metaPrompt,
      maxTokens: 2048, // Adjust as needed for potentially long structured prompts
      temperature: 0.5, // Allow some creativity in structuring but keep it focused
    });
    return { success: true, structuredPrompt };
  } catch (error: any) {
    console.error("Error structuring prompt with AI:", error);
    return { success: false, error: error.message || "Failed to structure prompt." };
  }
} 