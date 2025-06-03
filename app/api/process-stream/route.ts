export const dynamic = 'force-dynamic'; // Ensure dynamic execution for SSE
export const maxDuration = 300;

import { performDocumentProcessing, StatusUpdate, SendUpdateCallback } from '@/actions/processDocumentsLogic';

export async function POST(request: Request) {
  console.log("SSE /api/process-stream hit");

  let systemPromptContent: string;
  let optionalUserInput: string | undefined;
  let blobAccessUrls: string[];
  let originalFileNames: string[]; // To store original file names for recap

  try {
    // Expecting JSON body now
    const requestData = await request.json();
    systemPromptContent = requestData.systemPromptContent;
    optionalUserInput = requestData.optionalUserInput;
    blobAccessUrls = requestData.blobAccessUrls; // Array of Azure Blob URLs
    originalFileNames = requestData.originalFileNames; // Array of original file names

    if (!systemPromptContent) {
      console.error("SSE Error: systemPromptContent is missing from request body");
      return new Response(JSON.stringify({ error: 'systemPromptContent is missing' }), { status: 400 });
    }
    if (!blobAccessUrls || !Array.isArray(blobAccessUrls) || blobAccessUrls.length === 0) {
      console.error("SSE Error: blobAccessUrls are missing or invalid");
      return new Response(JSON.stringify({ error: 'blobAccessUrls are missing or invalid' }), { status: 400 });
    }
    if (!originalFileNames || !Array.isArray(originalFileNames) || originalFileNames.length !== blobAccessUrls.length) {
      console.error("SSE Error: originalFileNames are missing or do not match blobAccessUrls count");
      return new Response(JSON.stringify({ error: 'originalFileNames are missing or mismatched' }), { status: 400 });
    }

  } catch (e: any) {
    console.error("SSE Error: Failed to parse JSON request body", e);
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate: SendUpdateCallback = (data: StatusUpdate) => {
        try {
            controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
            console.warn("SSE: Failed to enqueue data, client might have disconnected.", e);
        }
      };

      try {
        sendUpdate({ type: 'status', message: 'Stream connection established. Starting document processing using Azure Blob Storage...' });
        
        // Call the actual processing logic with blob URLs and original file names
        const result = await performDocumentProcessing(
          blobAccessUrls, 
          originalFileNames, // Pass original file names
          systemPromptContent, 
          optionalUserInput ?? "", 
          sendUpdate
        );

        if (result.success) {
          sendUpdate({ type: 'status', message: 'Processing completed successfully.'});
        } else {
          sendUpdate({ type: 'error', error: result.error || 'Processing failed after stream start.' });
        }
        
      } catch (error: any) {
        console.error("Error during performDocumentProcessing call in SSE stream:", error);
        sendUpdate({ type: 'error', error: error.message || 'An critical error occurred during processing.' });
      } finally {
        console.log("SSE stream: Closing controller.");
        try {
            controller.close();
        } catch (e) {
            console.warn("SSE: Error closing controller, may already be closed.", e);
        }
      }
    },
    cancel() {
      console.log("SSE stream cancelled by client.");
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'none',
    },
  });
} 