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

// Define the StatusUpdate interface (consistent with the one in the SSE route)
export interface StatusUpdate {
  type: 'status' | 'progress' | 'result' | 'error';
  file?: string;
  message?: string;
  stage?: string; // e.g., 'docIntel', 'openai'
  progressPercent?: number; // For finer-grained progress within a stage
  analysis?: string;    // For the final result
  error?: string;       // For error messages
  totalFiles?: number;
  currentFileIndex?: number;
  currentFileName?: string;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// Define the callback function type
export type SendUpdateCallback = (update: StatusUpdate) => void;


// Helper function to format a table into Markdown - More Robust Version
function formatTableToMarkdown(table: DocumentTableOutput): string {
  const { rowCount, columnCount, cells } = table;
  if (rowCount === 0 || columnCount === 0) return "";

  const grid: string[][] = Array(rowCount).fill(null).map(() => Array(columnCount).fill(""));
  const mergedCells = new Set<string>(); 

  cells.forEach((cell: DocumentTableCellOutput) => {
    const { rowIndex, columnIndex, rowSpan = 1, columnSpan = 1, content } = cell;
    const cellKey = `${rowIndex}-${columnIndex}`;
    if (!mergedCells.has(cellKey)) {
      const formattedContent = content?.replace(/\r?\n/g, ' <br> ') || " ";
      grid[rowIndex][columnIndex] = formattedContent;
      if (rowSpan > 1 || columnSpan > 1) {
        for (let r = 0; r < rowSpan; r++) {
          for (let c = 0; c < columnSpan; c++) {
            if (r === 0 && c === 0) continue; 
            const mergedKey = `${rowIndex + r}-${columnIndex + c}`;
            mergedCells.add(mergedKey);
            if (rowIndex + r < rowCount && columnIndex + c < columnCount) {
               grid[rowIndex + r][columnIndex + c] = ""; 
            }
          }
        }
      }
    }
  });

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

  for (let i = 0; i < rowCount; i++) {
      markdown += "| " + grid[i].map(cellContent => cellContent || " ").join(" | ") + " |\n";
      if (headerRowIndices.has(i) && (!headerRowIndices.has(i+1) || i === rowCount - 1) && !headerSeparatorBuilt) {
         markdown += "| " + Array(columnCount).fill("---").join(" | ") + " |\n";
         headerSeparatorBuilt = true;
      }
  }
  return markdown + "\n";
}

export async function performDocumentProcessing( // Renamed and added callback
  formData: FormData, 
  systemPromptContent: string,
  optionalUserInput: string, // Added: new parameter
  sendUpdate: SendUpdateCallback // Added callback
): Promise<{ // Return type remains similar for overall success/failure of the whole operation
  success: boolean;
  analysis?: string; // This will now be sent via sendUpdate({type: 'result'})
  error?: string;    // Errors also sent via sendUpdate({type: 'error'})
}> {
  sendUpdate({ type: 'status', message: 'Document processing initiated.' });

  const docIntelEndpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const docIntelKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

  if (!docIntelEndpoint || !docIntelKey) {
    const errorMsg = "Azure Document Intelligence credentials missing.";
    sendUpdate({ type: 'error', error: errorMsg });
    return { success: false, error: errorMsg };
  }

  const missingOpenAICreds = 
     !process.env.AZURE_OPENAI_ENDPOINT || 
     !process.env.AZURE_API_KEY || 
     !process.env.AZURE_RESOURCE_NAME || 
     !openaiDeployment;

  if (missingOpenAICreds) {
     const errorMsg = "Azure OpenAI credentials missing (Endpoint, Key, Resource Name, or Deployment Name).";
     sendUpdate({ type: 'error', error: errorMsg });
     return { success: false, error: errorMsg };
  }

  const files = formData.getAll("files") as File[];

  if (!files || files.length === 0) {
    const errorMsg = "No files were uploaded.";
    sendUpdate({ type: 'error', error: errorMsg });
    return { success: false, error: errorMsg };
  }

  let conciseDocumentsData = "";
  const docIntelClient = DocumentIntelligence(
    docIntelEndpoint,
    new AzureKeyCredential(docIntelKey!)
  );

  sendUpdate({ 
    type: 'status', 
    stage: 'docIntel', 
    message: `Starting Document Intelligence for ${files.length} file(s)...`,
    totalFiles: files.length 
  });

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      sendUpdate({ 
        type: 'progress', 
        stage: 'docIntel', 
        file: file.name, 
        message: `Processing file ${i + 1} of ${files.length}: ${file.name}`,
        currentFileIndex: i,
        totalFiles: files.length,
        currentFileName: file.name
      });

      const buffer = Buffer.from(await file.arrayBuffer());
      const base64FileString = buffer.toString("base64");

      let modelId = "prebuilt-layout"; // Simplified, was conditional before but always prebuilt-layout
      sendUpdate({ 
        type: 'progress', 
        stage: 'docIntel', 
        file: file.name, 
        message: `Using '${modelId}' model. Submitting to Document Intelligence...`
      });
      
      let queryParams: AnalyzeDocumentParameters["queryParameters"] = {};
      const fileNameLower = file.name.toLowerCase();
      const isOfficeDocument = fileNameLower.endsWith('.docx') || fileNameLower.endsWith('.pptx') || fileNameLower.endsWith('.xlsx');
      if (!isOfficeDocument) {
        queryParams.features = ["ocr.highResolution"];
      }

      const initialPostResponse = await docIntelClient
        .path("/documentModels/{modelId}:analyze", modelId)
        .post({
          contentType: "application/json",
          body: {
            base64Source: base64FileString,
          },
          queryParameters: queryParams,
        });

      if (isUnexpected(initialPostResponse)) {
        const errorDetail = `SDK Error ${initialPostResponse.status} - ${JSON.stringify(initialPostResponse.body)}`;
        sendUpdate({ 
            type: 'error', 
            stage: 'docIntel', 
            file: file.name, 
            message: `Error starting analysis: ${errorDetail}` 
        });
        conciseDocumentsData += `Error processing ${file.name}: ${errorDetail}\n\n`;
        continue;
      }
      
      type DocumentAnalysisSuccessResponse = AnalyzeDocument202Response | AnalyzeDocumentLogicalResponse;
      const successResponse = initialPostResponse as DocumentAnalysisSuccessResponse;

      if (successResponse.status !== "202") {
         sendUpdate({ 
            type: 'status', // Or 'warning' if we add that type
            stage: 'docIntel', 
            file: file.name, 
            message: `Unexpected status ${successResponse.status} when starting analysis. Expected 202.`
        });
      }

      const operationLocation = successResponse.headers["operation-location"];
      if (!operationLocation) {
        const errorDetail = `Missing operation-location header (Status: ${successResponse.status})`;
        sendUpdate({ 
            type: 'error', 
            stage: 'docIntel', 
            file: file.name, 
            message: `Error processing: ${errorDetail}` 
        });
        conciseDocumentsData += `Error processing ${file.name}: ${errorDetail}\n\n`;
        continue;
      }

      let result: AnalyzeResultOutput | null | undefined = null;
      let analysisDone = false;
      const startTime = Date.now();
      const timeoutMs = 300000; // 5 minutes timeout

      sendUpdate({ 
        type: 'progress', 
        stage: 'docIntel', 
        file: file.name, 
        message: `Polling Document Intelligence results...`
      });

      let pollIteration = 0;
      while (!analysisDone && Date.now() - startTime < timeoutMs) {
        pollIteration++;
        let pollResponseStatus = 0;
        let pollResponseBody: AnalyzeOperationOutput | null = null;
        let pollErrorBody: any = null;

        try {
          const pollRawResponse = await fetch(operationLocation, {
            method: "GET",
            headers: {
              "Ocp-Apim-Subscription-Key": docIntelKey!,
              "Content-Type": "application/json"
            },
          });
          pollResponseStatus = pollRawResponse.status;

          if (!pollRawResponse.ok) {
            try {
              pollErrorBody = await pollRawResponse.json(); 
            } catch (e) {
              pollErrorBody = await pollRawResponse.text(); 
            }
            const errorDetail = `HTTP ${pollRawResponse.status} - ${JSON.stringify(pollErrorBody)}`;
            sendUpdate({ 
                type: 'error', 
                stage: 'docIntel', 
                file: file.name, 
                message: `Polling error: ${errorDetail}` 
            });
            conciseDocumentsData += `Error polling for ${file.name}: ${errorDetail}\n\n`;
            analysisDone = true;
            break;
          }
          pollResponseBody = await pollRawResponse.json() as AnalyzeOperationOutput;

        } catch (fetchError: any) {
          sendUpdate({ 
            type: 'error', 
            stage: 'docIntel', 
            file: file.name, 
            message: `Polling network/fetch error: ${fetchError.message}` 
          });
          conciseDocumentsData += `Error polling (network/fetch) for ${file.name}: ${fetchError.message}\n\n`;
          analysisDone = true; 
          break;
        }
        
        if (pollResponseBody) {
            if (pollResponseBody.status === "succeeded") {
              sendUpdate({ 
                type: 'progress', 
                stage: 'docIntel', 
                file: file.name, 
                message: 'Analysis successful. Extracting content.',
                progressPercent: 100 // Indicate completion for this file's DocIntel stage
              });
              result = pollResponseBody.analyzeResult;
              analysisDone = true;
            } else if (pollResponseBody.status === "failed") {
              const errorDetail = `Analysis failed. ${pollResponseBody.error?.message}`;
              sendUpdate({ 
                type: 'error', 
                stage: 'docIntel', 
                file: file.name, 
                message: errorDetail
              });
              conciseDocumentsData += `Error processing ${file.name}: ${errorDetail}\n\n`;
              analysisDone = true;
            } else if (["notStarted", "running", "processing"].includes(pollResponseBody.status)) {
              sendUpdate({ 
                type: 'progress', 
                stage: 'docIntel', 
                file: file.name, 
                message: `Status: ${pollResponseBody.status} (attempt ${pollIteration})`,
                // Estimate progress within polling, e.g., based on typical time or iterations
                progressPercent: Math.min(90, pollIteration * 10) // Example: 10% per poll up to 90%
              });
              await new Promise(resolve => setTimeout(resolve, 5000)); 
            } else {
              const errorDetail = `Unexpected status ${pollResponseBody.status}`;
              sendUpdate({ 
                type: 'error', 
                stage: 'docIntel', 
                file: file.name, 
                message: errorDetail
              });
              conciseDocumentsData += `Error processing ${file.name}: ${errorDetail}\n\n`;
              analysisDone = true;
            }
        } else if (!analysisDone) { 
            const errorDetail = `Null response body from poll. HTTP Status: ${pollResponseStatus}`;
            sendUpdate({ 
                type: 'error', 
                stage: 'docIntel', 
                file: file.name, 
                message: `Polling error: ${errorDetail}` 
            });
            conciseDocumentsData += `Error polling for ${file.name}: ${errorDetail} \n\n`;
            analysisDone = true;
        }
      }

      if (!analysisDone && Date.now() - startTime >= timeoutMs) {
        const errorDetail = `Analysis timed out after ${timeoutMs / 1000}s.`;
        sendUpdate({ 
            type: 'error', 
            stage: 'docIntel', 
            file: file.name, 
            message: errorDetail 
        });
        conciseDocumentsData += `Error processing ${file.name}: ${errorDetail}\n\n`;
      }

      if (result) {
        // Consolidate content extraction logic
        let combinedPageContent = "";
        if (result.content) { // Prefer result.content if available (usually for non-Office)
            combinedPageContent = result.content;
        } else if (result.pages && result.pages.length > 0) { // Fallback to iterating pages (often for Office)
            for (const page of result.pages) {
              for (const line of page.lines || []) {
                combinedPageContent += line.content + "\n";
              }
            }
        }
        
        if (combinedPageContent.trim()) {
            sendUpdate({ 
                type: 'progress', 
                stage: 'docIntel', 
                file: file.name, 
                message: `Content extracted (length: ${combinedPageContent.trim().length}).`
            });
            conciseDocumentsData += `## File: ${file.name}\n`;
            conciseDocumentsData += `Pages: ${result.pages?.length ?? 'N/A'}\n\n`;

            if (result.tables && result.tables.length > 0) {
              conciseDocumentsData += `### Extracted Tables\n\n`;
              result.tables.forEach((table: DocumentTableOutput, index: number) => {
                conciseDocumentsData += `**Table ${index + 1} (Page: ${table.boundingRegions?.[0]?.pageNumber})**\n\n`;
                conciseDocumentsData += formatTableToMarkdown(table);
              });
            }
            conciseDocumentsData += combinedPageContent.trim() + "\n\n"; 
            conciseDocumentsData += "---\n\n"; 
        } else {
            const msg = `No text content extracted from ${file.name}.`;
            sendUpdate({ type: 'status', stage: 'docIntel', file: file.name, message: msg });
            if (!conciseDocumentsData.includes(`Error processing ${file.name}:`)) { // Avoid double error messages
                conciseDocumentsData += `${msg} The document might be empty or an unrecoverable error occurred during text extraction.\n\n---\n\n`;
            }
        }
      } else { // Result is null, means an error likely occurred and was logged/sent
         if (!conciseDocumentsData.includes(`Error processing ${file.name}:`)) { // Avoid double messages
            const msg = `No result from Document Intelligence for ${file.name}.`;
            sendUpdate({ type: 'status', stage: 'docIntel', file: file.name, message: msg });
            conciseDocumentsData += `${msg}\n\n---\n\n`;
         }
      }
    } // End of files loop
    sendUpdate({ type: 'status', stage: 'docIntel', message: 'All files processed by Document Intelligence.' });
  } catch (docIntelError: any) {
    const errorMsg = `Failed during data extraction: ${docIntelError.message || "Unknown error"}`;
    sendUpdate({ type: 'error', stage: 'docIntel', error: errorMsg });
    // Note: The function will return here, so the final OpenAI step won't run.
    // The SSE stream in the route handler should handle closing the stream upon promise rejection.
    // We throw to ensure the promise from performDocumentProcessing rejects.
    throw new Error(errorMsg); 
  }

  // --- Step 2: Analyze with Azure OpenAI ---
  sendUpdate({ 
    type: 'status', 
    stage: 'openai', 
    message: 'Preparing data for AI analysis...' 
  });

  const fileCount = files.length;
  const allFileNamesString = files.map(f => f.name).join(', ');

  // --- Construct the Contextual Information Recap block ---
  const recapFileCount = fileCount > 0 ? fileCount.toString() : "N/A";
  const recapAllFileNames = allFileNamesString ? allFileNamesString : "N/A";
  const recapOptionalUserInput = optionalUserInput && optionalUserInput.trim() ? optionalUserInput : "N/A";

  const contextualRecapBlock = `

--- Contextual Information Recap ---
<fileCount>${recapFileCount}</fileCount>
<allFileNames>${recapAllFileNames}</allFileNames>
<optionalUserInput>${recapOptionalUserInput}</optionalUserInput>
--- End of Contextual Information Recap ---`;
  // --- End of recap block construction ---
  
  const analysisPrompt = `
**Input Data:**
${conciseDocumentsData}`;
  
  sendUpdate({ 
    type: 'status', 
    stage: 'openai', 
    message: 'Sending data to Azure OpenAI for final analysis...' 
  });
  
  try {
    const languageModel = azure(openaiDeployment!); // Added non-null assertion as it's checked
    
    // The systemPromptContent is now treated as read-only from the Prompt-Master agent.
    // We append the contextual recap block to it.
    const finalSystemMessage = systemPromptContent + contextualRecapBlock;

    // Log the length of the final system message (as a proxy for token count)
    console.log(`Final system message length: ${finalSystemMessage.length} characters`);

    const { text: analysisResult, usage: tokenUsage } = await generateText({
      model: languageModel,
      system: finalSystemMessage, // Use the combined prompt + recap
      prompt: analysisPrompt,
      maxTokens: 32768, 
      temperature: 0.3,
    });

    sendUpdate({ 
      type: 'status', 
      stage: 'openai', 
      message: 'AI analysis complete.' 
    });
    // Send the final result via the callback
    sendUpdate({ type: 'result', analysis: analysisResult, tokenUsage });
    return { success: true, analysis: analysisResult }; // Still return overall success

  } catch (aiError: any) {
    const errorMessage = aiError.message || "Unknown AI analysis error";
    const errorDetails = aiError.cause ? JSON.stringify(aiError.cause) : '';
    const fullError = `AI analysis failed: ${errorMessage} ${errorDetails}`;
    sendUpdate({ type: 'error', stage: 'openai', error: fullError });
    // Throw to ensure the promise from performDocumentProcessing rejects.
    throw new Error(fullError);
  }
} 