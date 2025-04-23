'use server';

import {
  DocumentAnalysisClient,
  AzureKeyCredential,
  AnalyzeResult,
  AnalyzedDocument,
  DocumentTable,
  DocumentTableCell,
} from "@azure/ai-form-recognizer";
import { azure } from "@ai-sdk/azure";
import { generateText } from "ai";

// Helper function to format a table into Markdown - More Robust Version
function formatTableToMarkdown(table: DocumentTable): string {
  const { rowCount, columnCount, cells } = table;
  if (rowCount === 0 || columnCount === 0) return "";

  // Create a 2D grid initialized with empty strings
  const grid: string[][] = Array(rowCount).fill(null).map(() => Array(columnCount).fill(""));

  // Keep track of merged cells to avoid overwriting
  const mergedCells = new Set<string>(); // Store "row-col"

  cells.forEach((cell: DocumentTableCell) => {
    const { rowIndex, columnIndex, rowSpan = 1, columnSpan = 1, content } = cell;
    const cellKey = `${rowIndex}-${columnIndex}`;

    // Only process if this is the top-left cell of a potential span and not already filled by another span
    if (!mergedCells.has(cellKey)) {
      const formattedContent = content?.replace(/\r?\n/g, ' <br> ') || " ";
      grid[rowIndex][columnIndex] = formattedContent;

      // Mark cells covered by rowSpan and columnSpan as merged
      if (rowSpan > 1 || columnSpan > 1) {
        for (let r = 0; r < rowSpan; r++) {
          for (let c = 0; c < columnSpan; c++) {
            if (r === 0 && c === 0) continue; // Skip the top-left cell itself
            const mergedKey = `${rowIndex + r}-${columnIndex + c}`;
            mergedCells.add(mergedKey);
            // Optionally, fill merged cells with a placeholder or leave empty
            if (rowIndex + r < rowCount && columnIndex + c < columnCount) {
               grid[rowIndex + r][columnIndex + c] = ""; // Or placeholder like '...'
            }
          }
        }
      }
    }
  });


  // Find header rows based on 'columnHeader' kind
  const headerRowIndices = new Set<number>();
  cells.forEach(cell => {
      if (cell.kind === 'columnHeader') {
          for(let i = 0; i < (cell.rowSpan ?? 1); i++) {
              headerRowIndices.add(cell.rowIndex + i);
          }
      }
  });

  let markdown = "";
  let headerSeparatorBuilt = false;

  // Build Markdown table
  for (let i = 0; i < rowCount; i++) {
      // Join cells for the current row
      markdown += "| " + grid[i].map(cellContent => cellContent || " ").join(" | ") + " |\n";

      // Add separator after the *last* header row
      if (headerRowIndices.has(i) && (!headerRowIndices.has(i+1) || i === rowCount - 1) && !headerSeparatorBuilt) {
         markdown += "| " + Array(columnCount).fill("---").join(" | ") + " |\n";
         headerSeparatorBuilt = true;
      }
  }


  return markdown + "\n"; // Add extra newline for spacing
}

// Default analysis prompt string (extracted for reusability)
const DEFAULT_ANALYSIS_PROMPT_TEMPLATE = `**Your Role:** You are an Expert Financial Analyst AI Assistant specializing in synthesizing quarterly equity research reports.\n\n**Primary Objective:** Analyze the following CONCISELY EXTRACTED data from multiple quarterly equity research reports (potentially from different research houses like ABG Sundal Collier, etc., for a company like Hexpol). Your core task is to identify and summarize **how the main messages, sentiment, recommendations, and key estimates from EACH DISTINCT research house have EVOLVED across the different quarters** represented.\n\n**Input Data Format:** The input consists of concatenated summaries from multiple files. Each file summary starts with \`## File: [Filename]\`, includes page count, and contains \`### Extracted Tables\` formatted in Markdown, separated by \`---\`. **Focus your analysis PRIMARILY on the tables**, as they often contain the key recommendations, target prices, and estimate changes. Use filenames and table context to infer dates/quarters and research houses if possible.\n\n**Analysis & Output:**\n1.  Group findings by **Research House**.\n2.  Within each house, present findings **chronologically** (by inferred quarter/date).\n3.  For each report/quarter per house, summarize: **Recommendation, Target Price, Key Estimate Trends, and overall Sentiment.**\n4.  Conclude each research house section with a paragraph summarizing the **Overall Evolution** of their view.\n5.  Structure the output clearly using Markdown.\n6.  **Be concise and analytical.** Focus on the *changes* and *trends* over time per source.\n7.  Base analysis **only** on the provided text. If source/date is unclear, state that.\n\n**Analyze the following data:**\n\n{{CONCISE_DOCUMENTS_DATA}}`; // Using a placeholder

// New Server Action to get the default prompt
export async function getDefaultAnalysisPrompt(): Promise<string> {
  // In a real app, this might read from a config file or DB
  // For now, return the template string (without data interpolated)
  return DEFAULT_ANALYSIS_PROMPT_TEMPLATE.replace('{{CONCISE_DOCUMENTS_DATA}}', '{CONCISE_DOCUMENTS_DATA}'); // Return template placeholder
}

export async function processDocumentsAction(
  formData: FormData, 
  customAnalysisPromptTemplate?: string // Optional: Accept custom prompt template
): Promise<{
  success: boolean;
  analysis?: string;
  error?: string;
}> {
  const docIntelEndpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const docIntelKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

  // Check required environment variables for SDK auto-detection
  if (!docIntelEndpoint || !docIntelKey) {
    console.error("DEBUG: Missing Doc Intel Env Vars", { 
        endpoint: !!docIntelEndpoint,
        key: !!docIntelKey 
    });
    return { success: false, error: "Azure Document Intelligence credentials missing." };
  }

  // More detailed check for Azure OpenAI vars
  const missingOpenAICreds = 
     !process.env.AZURE_OPENAI_ENDPOINT || 
     !process.env.AZURE_API_KEY || 
     !process.env.AZURE_RESOURCE_NAME || 
     !openaiDeployment;

  if (missingOpenAICreds) {
     console.error("DEBUG: Missing Azure OpenAI Env Vars:", {
        AZURE_OPENAI_ENDPOINT: !!process.env.AZURE_OPENAI_ENDPOINT,
        AZURE_API_KEY: !!process.env.AZURE_API_KEY, 
        AZURE_RESOURCE_NAME: !!process.env.AZURE_RESOURCE_NAME,
        AZURE_OPENAI_DEPLOYMENT_NAME: !!openaiDeployment
     });
     return { success: false, error: "Azure OpenAI credentials missing (Endpoint, Key, Resource Name, or Deployment Name)." };
  }

  const files = formData.getAll("files") as File[];

  if (!files || files.length === 0) {
    return { success: false, error: "No files were uploaded." };
  }

  // --- Step 1: Extract Concise Info using Document Intelligence --- 
  let conciseDocumentsData = "";
  const docIntelClient = new DocumentAnalysisClient(
    docIntelEndpoint,
    new AzureKeyCredential(docIntelKey)
  );
  const layoutModel = "prebuilt-layout";

  console.log(`Step 1: Extracting data from ${files.length} file(s)...`);
  try {
    for (const file of files) {
      console.log(` - Processing file with Doc Intel: ${file.name}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      const poller = await docIntelClient.beginAnalyzeDocument(layoutModel, buffer);
      const result: AnalyzeResult<AnalyzedDocument> = await poller.pollUntilDone();

      conciseDocumentsData += `## File: ${file.name}\n`;
      conciseDocumentsData += `Pages: ${result.pages?.length ?? 'N/A'}\n\n`;

      // Add formatted tables (could add logic here to only pick specific tables if needed)
      if (result.tables && result.tables.length > 0) {
        conciseDocumentsData += `### Extracted Tables\n\n`;
        result.tables.forEach((table, index) => {
          conciseDocumentsData += `**Table ${index + 1} (Page: ${table.boundingRegions?.[0]?.pageNumber})**\n\n`;
          conciseDocumentsData += formatTableToMarkdown(table);
        });
      }
      // Optional: Add key paragraphs or summary text here if needed 
      // Example: Extract first paragraph 
      // if (result.paragraphs && result.paragraphs.length > 0) {
      //    conciseDocumentsData += `### Opening Paragraph\n\n${result.paragraphs[0].content}\n\n`; 
      // }

      conciseDocumentsData += "---\n\n";
    }
    console.log("Step 1: Finished data extraction.");
  } catch (docIntelError: any) {
    console.error("Error during Document Intelligence processing:", docIntelError);
    return {
      success: false,
      error: `Failed during data extraction: ${docIntelError.message || "Unknown error"}`,
    };
  }

  // --- Step 2: Analyze with Azure OpenAI using Vercel AI SDK --- 
  
  // Use the custom prompt if provided, otherwise use the default
  const analysisPromptTemplateToUse = customAnalysisPromptTemplate || DEFAULT_ANALYSIS_PROMPT_TEMPLATE;
  
  // Inject the extracted data into the chosen template
  const analysisPrompt = analysisPromptTemplateToUse.replace('{{CONCISE_DOCUMENTS_DATA}}', conciseDocumentsData);
  
  console.log("Step 2: Starting AI analysis...");

  // --- DEBUG: Log environment variables --- 
  console.log("DEBUG: Checking Azure OpenAI Env Vars:");
  console.log(`AZURE_OPENAI_ENDPOINT: ${process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'MISSING'}`);
  console.log(`AZURE_API_KEY: ${process.env.AZURE_API_KEY ? 'SET' : 'MISSING'}`); 
  console.log(`AZURE_RESOURCE_NAME: ${process.env.AZURE_RESOURCE_NAME ? 'SET' : 'MISSING'}`);
  console.log(`AZURE_OPENAI_DEPLOYMENT_NAME: ${openaiDeployment ? 'SET' : 'MISSING'}`); // Already checked openaiDeployment variable
  // --- End DEBUG --- 

  try {
    // Get the Azure OpenAI language model instance using standard SDK pattern
    const languageModel = azure(openaiDeployment);
    
    const { text: analysisResult } = await generateText({
      model: languageModel,
      system: "You are a helpful financial analyst assistant.", 
      prompt: analysisPrompt,
      maxTokens: 4096,  
      temperature: 0.3, 
    });

    console.log("Step 2: AI analysis finished.");
    return { success: true, analysis: analysisResult };

  } catch (aiError: any) {
    console.error("Error during Azure OpenAI analysis:", aiError);
    // Attempt to provide more specific error info if available
    const errorMessage = aiError.message || "Unknown AI analysis error";
    const errorDetails = aiError.cause ? JSON.stringify(aiError.cause) : '';
    return {
      success: false,
      error: `AI analysis failed: ${errorMessage} ${errorDetails}`,
    };
  }
} 