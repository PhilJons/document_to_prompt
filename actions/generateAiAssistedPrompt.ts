'use server';

import { azure } from "@ai-sdk/azure";
import { generateText } from "ai";

export async function generateAiAssistedPromptAction(userInput: string): Promise<{
  success: boolean;
  generatedPrompt?: string;
  error?: string;
}> {
  const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME; // Assuming you use the same deployment

  if (!process.env.AZURE_OPENAI_ENDPOINT || 
      !process.env.AZURE_API_KEY || 
      !process.env.AZURE_RESOURCE_NAME || 
      !openaiDeployment) {
    console.error("DEBUG: Missing Azure OpenAI Env Vars for AI Prompt Generation");
    return { success: false, error: "Azure OpenAI credentials for prompt generation are missing." };
  }

  if (!userInput || userInput.trim() === "") {
    return { success: false, error: "Input for prompt generation cannot be empty." };
  }

  const metaPromptSystem = `You are an Expert Prompt Engineer AI. Your task is to assist a user in transforming their raw ideas, instructions, or bullet points into a high-quality, effective system prompt suitable for advanced language models like GPT-4.1.

The generated system prompt MUST adhere to the following principles of a proven prompt engineering framework:
1.  **Literal Instruction Following:** Craft the prompt so that models like GPT-4.1, which interpret instructions very literally, can follow it precisely.
2.  **Clarity and Unambiguity:** Ensure every part of the prompt is crystal clear, leaving no room for misinterpretation. Define the task, desired output, context, and AI's role with utmost precision.
3.  **Specificity:** Avoid vague language. Use specific terms and provide concrete examples or constraints if implied by the user's input.
4.  **Completeness:** The prompt should equip the target AI with all necessary information: its persona/role, specific constraints, desired tone, knowledge cutoffs (if relevant), and detailed output structure.
5.  **Steerability:** Phrase the prompt to guide the target AI's behavior effectively and reliably. If the user's request is complex, consider breaking it down into clear steps or phases for the target AI.
6.  **Planning Induction (If Applicable):** For complex tasks, embed a 'hidden scratchpad' or a step-by-step thinking process within the prompt for the target AI to follow.
7.  **"Out" Condition (If Applicable):** Instruct the target AI on how to respond if it cannot fulfill the request based on the provided context or its capabilities (e.g., "If the answer is not found in the provided documents, state 'Information not available in the documents.'").
8.  **Conciseness with Purpose:** Be thorough but avoid unnecessary verbosity. Every word should contribute to the prompt's effectiveness.
9.  **Output Definition:** Clearly specify the expected output format (e.g., JSON, markdown, bullet points), length, style, and language.

Your output should be directly usable as a system prompt. Do NOT include any conversational preface, self-correction notes, or explanations about your generation process. Just the prompt.`;

  const userInstructionsForMetaPrompt = `User's Raw Input (ideas/instructions to be transformed into a system prompt):
---
${userInput}
---

Based on the user's raw input above, generate ONLY the refined and complete system prompt.`;

  try {
    const languageModel = azure(openaiDeployment);
    const { text: generatedPromptResult } = await generateText({
      model: languageModel,
      system: metaPromptSystem,
      prompt: userInstructionsForMetaPrompt,
      maxTokens: 1024, // Adjust as needed, system prompts can be long
      temperature: 0.5, // Lower temperature for more focused and structured output
    });

    if (!generatedPromptResult || generatedPromptResult.trim() === "") {
      return { success: false, error: "AI failed to generate a prompt. The result was empty." };
    }

    return { success: true, generatedPrompt: generatedPromptResult.trim() };

  } catch (aiError: any) {
    console.error("Error during AI-assisted prompt generation:", aiError);
    const errorMessage = aiError.message || "Unknown AI analysis error for prompt generation";
    const errorDetails = aiError.cause ? JSON.stringify(aiError.cause) : '';
    return {
      success: false,
      error: `AI prompt generation failed: ${errorMessage} ${errorDetails}`,
    };
  }
} 