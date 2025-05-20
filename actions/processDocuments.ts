'use server';

import { azure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { setLogLevel } from "@azure/logger";
import DocumentIntelligence, {
  DocumentTableOutput,
  DocumentTableCellOutput,
  AnalyzeResultOutput,
  AnalyzeOperationOutput,
  isUnexpected,
  AnalyzeDocumentParameters,
  AnalyzeDocument202Response,
  AnalyzeDocumentLogicalResponse
} from "@azure-rest/ai-document-intelligence";
import { AzureKeyCredential } from "@azure/core-auth";

// Attempt to enable Azure SDK verbose logging
setLogLevel("info");

// Helper function to format a table into Markdown - More Robust Version
function formatTableToMarkdown(table: DocumentTableOutput): string {
  const { rowCount, columnCount, cells } = table;
  if (rowCount === 0 || columnCount === 0) return "";

  // Create a 2D grid initialized with empty strings
  const grid: string[][] = Array(rowCount).fill(null).map(() => Array(columnCount).fill(""));

  // Keep track of merged cells to avoid overwriting
  const mergedCells = new Set<string>(); // Store "row-col"

  cells.forEach((cell: DocumentTableCellOutput) => {
    const { rowIndex, columnIndex, rowSpan = 1, columnSpan = 1, content } = cell;
    const cellKey = `${rowIndex}-${columnIndex}`;

    // Only process if this is the top-left cell of a potential span and not already filled by another span
    if (!mergedCells.has(cellKey)) {
      const formattedContent = content?.replace(/\\r?\\n/g, ' <br> ') || " ";
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
  cells.forEach((cell: DocumentTableCellOutput) => {
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
      markdown += "| " + grid[i].map(cellContent => cellContent || " ").join(" | ") + " |\\n";

      // Add separator after the *last* header row
      if (headerRowIndices.has(i) && (!headerRowIndices.has(i+1) || i === rowCount - 1) && !headerSeparatorBuilt) {
         markdown += "| " + Array(columnCount).fill("---").join(" | ") + " |\\n";
         headerSeparatorBuilt = true;
      }
  }


  return markdown + "\\n"; // Add extra newline for spacing
}

export async function processDocumentsAction(
  formData: FormData, 
  systemPromptContent: string
  ): Promise<{
  success: boolean;
  analysis?: string;
  error?: string;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
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
  const docIntelClient = DocumentIntelligence(
    docIntelEndpoint,
    new AzureKeyCredential(docIntelKey!)
  );

  // console.log(`Step 1: Extracting data from ${files.length} file(s)...`);
  try {
    for (const file of files) {
      // console.log(` - Processing file with Doc Intel: ${file.name}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64FileString = buffer.toString("base64");

      let modelId: string;
      const fileNameLower = file.name.toLowerCase();
      if (fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.pptx') || fileNameLower.endsWith('.xlsx')) {
        modelId = "prebuilt-layout";
      } else {
        modelId = "prebuilt-layout";
      }
      // console.log(` - Using '${modelId}' for file: ${file.name}`);

      // Define queryParameters with features conditionally
      let queryParams: AnalyzeDocumentParameters["queryParameters"] = {};
      const isOfficeDocument = fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.pptx') || fileNameLower.endsWith('.xlsx');

      if (!isOfficeDocument) {
        queryParams.features = ["ocr.highResolution"];
      } else {
        // For Office documents, ocr.highResolution might not be supported or needed,
        // or other office-specific features might be applicable here in the future.
        // For now, sending no specific features or only supported ones.
        // If prebuilt-layout needs specific features for office docs like keyValuePairs, add them here.
        // Example: queryParams.features = ["keyValuePairs"];
      }

      const initialPostResponse = await docIntelClient
        .path("/documentModels/{modelId}:analyze", modelId)
        .post({
          contentType: "application/json",
          body: {
            base64Source: base64FileString,
          },
          queryParameters: queryParams, // Use the conditional queryParams
        });

      if (isUnexpected(initialPostResponse)) {
        console.error(
          `Error starting analysis for ${file.name}: Status ${initialPostResponse.status}`, 
          initialPostResponse.body 
        );
        conciseDocumentsData += `Error processing ${file.name}: SDK Error ${initialPostResponse.status} - ${JSON.stringify(initialPostResponse.body)}\\n\\n`;
        continue;
      }
      
      // Type assertion for success path
      type DocumentAnalysisSuccessResponse = AnalyzeDocument202Response | AnalyzeDocumentLogicalResponse;
      const successResponse = initialPostResponse as DocumentAnalysisSuccessResponse;

      // If here, initialPostResponse is one of the success types
      if (successResponse.status !== "202") {
        console.warn(
          `Unexpected status ${successResponse.status} when starting analysis for ${file.name}. Expected 202. Body:`, 
          successResponse.body 
        );
      }

      const operationLocation = successResponse.headers["operation-location"];
      if (!operationLocation) {
        console.error(
          `Error processing ${file.name}: Missing operation-location header. Status: ${successResponse.status}`,
           successResponse.body
        );
        conciseDocumentsData += `Error processing ${file.name}: Missing operation-location header (Status: ${successResponse.status}).\\n\\n`;
        continue;
      }

      let result: AnalyzeResultOutput | null | undefined = null;
      let analysisDone = false;
      const startTime = Date.now();
      const timeoutMs = 300000; // 5 minutes timeout

      // console.log(` - Polling operation for ${file.name} at: ${operationLocation}`);

      while (!analysisDone && Date.now() - startTime < timeoutMs) {
        let pollResponseStatus = 0;
        let pollResponseBody: AnalyzeOperationOutput | null = null;
        let pollErrorBody: any = null;

        try {
          const pollRawResponse = await fetch(operationLocation, {
            method: "GET",
            headers: {
              "Ocp-Apim-Subscription-Key": docIntelKey!, // Key needed for direct API call
              "Content-Type": "application/json"
            },
          });
          pollResponseStatus = pollRawResponse.status;

          if (!pollRawResponse.ok) {
            console.error(`Polling error for ${file.name}: HTTP Status ${pollRawResponse.status}`);
            try {
              pollErrorBody = await pollRawResponse.json(); // Try to parse error as JSON
            } catch (e) {
              pollErrorBody = await pollRawResponse.text(); // Fallback to text
            }
            conciseDocumentsData += `Error polling for ${file.name}: HTTP ${pollRawResponse.status} - ${JSON.stringify(pollErrorBody)}\\n\\n`;
            analysisDone = true;
            break;
          }
          pollResponseBody = await pollRawResponse.json() as AnalyzeOperationOutput;

        } catch (fetchError: any) {
          console.error(`Fetch error during polling for ${file.name}:`, fetchError.message);
          conciseDocumentsData += `Error polling (network/fetch) for ${file.name}: ${fetchError.message}\\n\\n`;
          analysisDone = true; // Stop on fetch error
          break;
        }
        

        if (pollResponseBody) {
            if (pollResponseBody.status === "succeeded") {
            // console.log(` - Analysis for ${file.name} succeeded.`);
            result = pollResponseBody.analyzeResult;
            analysisDone = true;
            } else if (pollResponseBody.status === "failed") {
            console.error(` - Analysis for ${file.name} failed.`, pollResponseBody.error);
            conciseDocumentsData += `Error processing ${file.name}: Analysis failed. ${pollResponseBody.error?.message}\\n\\n`;
            analysisDone = true;
            } else if (["notStarted", "running", "processing"].includes(pollResponseBody.status)) {
            // console.log(` - Analysis for ${file.name} is still ${pollResponseBody.status}. Waiting...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay
            } else {
            console.error(` - Unexpected status for ${file.name}: ${pollResponseBody.status}`, pollResponseBody);
            conciseDocumentsData += `Error processing ${file.name}: Unexpected status ${pollResponseBody.status}\\n\\n`;
            analysisDone = true;
            }
        } else if (!analysisDone) { // If responseBody is null but not due to a handled error that set analysisDone
            console.error(` - Polling for ${file.name} resulted in null body but no explicit error. HTTP Status: ${pollResponseStatus}`);
            conciseDocumentsData += `Error polling for ${file.name}: Null response body from poll. HTTP Status: ${pollResponseStatus} \\n\\n`;
            analysisDone = true; // Stop if we get an empty successful response unexpectedly
        }
      }

      if (!analysisDone && Date.now() - startTime >= timeoutMs) {
        console.error(` - Analysis for ${file.name} timed out after ${timeoutMs / 1000}s.`);
        conciseDocumentsData += `Error processing ${file.name}: Analysis timed out.\\n\\n`;
      }

      if (result && result.content) {
        // console.log(`---------- Raw Extracted Text for ${file.name} (First 200 chars) ----------`);
        // console.log(result.content.substring(0, 200));
        // console.log(`---------- End of Raw Extracted Text for ${file.name} ----------`);

        conciseDocumentsData += `## File: ${file.name}\\n`;
        conciseDocumentsData += `Pages: ${result.pages?.length ?? 'N/A'}\\n\\n`;

        if (result.tables && result.tables.length > 0) {
          conciseDocumentsData += `### Extracted Tables\\n\\n`;
          result.tables.forEach((table: DocumentTableOutput, index: number) => {
            conciseDocumentsData += `**Table ${index + 1} (Page: ${table.boundingRegions?.[0]?.pageNumber})**\\n\\n`;
            conciseDocumentsData += formatTableToMarkdown(table);
          });
        }
        conciseDocumentsData += result.content + "\\n\\n"; // Append the actual content
        conciseDocumentsData += "---\\n\\n";

      } else if (result && result.pages && result.pages.length > 0) {
        let combinedPageContent = "";
        for (const page of result.pages) {
          for (const line of page.lines || []) {
            combinedPageContent += line.content + "\\n";
          }
        }
        if (combinedPageContent) {
          // console.log(
          //   ` - Extracted content for ${file.name} from pages (length: ${combinedPageContent.length})`
          // );
          // console.log(`---------- Raw Extracted Text (from pages) for ${file.name} (First 200 chars) ----------`);
          // console.log(combinedPageContent.substring(0, 200));
          // console.log(`---------- End of Raw Extracted Text (from pages) for ${file.name} ----------`);

          conciseDocumentsData += `## File: ${file.name}\\n`;
          conciseDocumentsData += `Pages: ${result.pages?.length ?? 'N/A'}\\n\\n`;

          if (result.tables && result.tables.length > 0) {
            conciseDocumentsData += `### Extracted Tables\\n\\n`;
            result.tables.forEach((table: DocumentTableOutput, index: number) => {
              conciseDocumentsData += `**Table ${index + 1} (Page: ${table.boundingRegions?.[0]?.pageNumber})**\\n\\n`;
              conciseDocumentsData += formatTableToMarkdown(table);
            });
          }
          conciseDocumentsData += combinedPageContent.trim() + "\\n\\n"; // Append combined content, trim, and add newlines
          conciseDocumentsData += "---\\n\\n"; 
        } else {
          // console.log(` - No content extracted from pages for ${file.name}`);
          conciseDocumentsData += `No content could be extracted from ${file.name} (from pages).\\n\\n`;
          conciseDocumentsData += "---\\n\\n";
        }
      } else {
        // console.log(
        //   ` - No content property found in result for ${file.name}, or result is null.`
        // );
        // Check if there was an error message pushed already
        if (!conciseDocumentsData.includes(`Error processing ${file.name}:`)) {
           conciseDocumentsData += `No content could be extracted from ${file.name}. The document might be empty, in an unsupported format, or an error occurred during processing.\n\n`;
        }
      }
    }
    // console.log("Step 1: Finished data extraction.");
  } catch (docIntelError: any) {
    console.error("Error during Document Intelligence processing:", docIntelError);
    return {
      success: false,
      error: `Failed during data extraction: ${docIntelError.message || "Unknown error"}`,
    };
  }

  // --- Step 2: Analyze with Azure OpenAI using Vercel AI SDK ---
  // Note: Interpolating conciseDocumentsData and file count directly into the template literal.
  // We need to get the actual file count to inject it here.
  const fileCount = files.length; 
  const allFileNamesString = files.map(f => f.name).join(', '); // Collect file names
  
  const analysisPrompt = `
**Input Data:**
${conciseDocumentsData}`;
  
  // --- Original complex analysisPrompt is being temporarily simplified for testing --- // This comment refers to the large template YOU deleted, which is fine.
  
  /* Simplified prompt for testing if the AI can access and process the text at all (Now commented out)
  const analysisPrompt_simplified = `
**Task:** You are a helpful assistant. For each document provided below under "Input Data:", briefly summarize its main topics. List each document by its filename.

**Input Data:**
${conciseDocumentsData}`;
  */

  // console.log("Step 2: Starting AI analysis...");

  // --- DEBUG: Log environment variables ---
  // console.log("DEBUG: Checking Azure OpenAI Env Vars:");
  // console.log(`AZURE_OPENAI_ENDPOINT: ${process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'MISSING'}`);
  // console.log(`AZURE_API_KEY: ${process.env.AZURE_API_KEY ? 'SET' : 'MISSING'}`); 
  // console.log(`AZURE_RESOURCE_NAME: ${process.env.AZURE_RESOURCE_NAME ? 'SET' : 'MISSING'}`);
  // console.log(`AZURE_OPENAI_DEPLOYMENT_NAME: ${openaiDeployment ? 'SET' : 'MISSING'}`);
  // --- End DEBUG --- 

  // console.log("---------- System Prompt for AI (System Message) ----------");
  // console.log(systemPromptContent);
  // console.log("-------------------------------------------------------------");

  // console.log("---------- Full Prompt for AI Analysis (User Message) ----------");
  // console.log(analysisPrompt);
  // console.log("-----------------------------------------------------------");

  try {
    // Get the Azure OpenAI language model instance using standard SDK pattern
    const languageModel = azure(openaiDeployment!);
    
    // Prepare the final system message by interpolating fileCount into systemPromptContent (from dialog)
    let finalSystemMessage = systemPromptContent;
    finalSystemMessage = finalSystemMessage.replace(/\${fileCount}/g, fileCount.toString());
    finalSystemMessage = finalSystemMessage.replace(/\${allFileNames}/g, allFileNamesString); // Interpolate file names

    // analysisPrompt (defined by your recent change) is the user message: **Input Data:** ${conciseDocumentsData}
    
    const { text: analysisResult, usage: tokenUsage } = await generateText({
      model: languageModel,
      system: finalSystemMessage, // Use the processed systemPromptContent from the dialog
      prompt: analysisPrompt,   // Use the data-only prompt as defined by your selection
      maxTokens: 32768, 
      temperature: 0.3,
    });

    // console.log("---------- AI Analysis Result (First 200 chars) ----------");
    // console.log(analysisResult.substring(0, 200));
    // console.log("-----------------------------------------------------------");
    console.log("Token Usage:", tokenUsage); // Log token usage

    // console.log("Step 2: AI analysis finished.");
    return { success: true, analysis: analysisResult, tokenUsage };

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