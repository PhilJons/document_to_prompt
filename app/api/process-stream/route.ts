export const dynamic = 'force-dynamic'; // Ensure dynamic execution for SSE
export const maxDuration = 300;

import { performDocumentProcessing, StatusUpdate, SendUpdateCallback } from '@/actions/processDocumentsLogic';

export async function POST(request: Request) {
  console.log("SSE /api/process-stream hit");

  let formData: FormData;
  let systemPromptContent: string;
  let optionalUserInput: string | undefined;

  try {
    formData = await request.formData();
    systemPromptContent = formData.get('systemPromptContent') as string;
    optionalUserInput = formData.get('optionalUserInput') as string | undefined;

    if (!systemPromptContent) {
      // This error won't be streamed as it's before stream setup, 
      // but good to have a server-side check.
      console.error("SSE Error: systemPromptContent is missing from formData");
      return new Response(JSON.stringify({ error: 'systemPromptContent is missing' }), { status: 400 });
    }
    // Create a new FormData to pass to performDocumentProcessing if we want to exclude systemPromptContent from it.
    // Or, ensure performDocumentProcessing correctly handles/ignores it.
    // For now, we assume performDocumentProcessing correctly extracts only 'files'.
  } catch (e: any) {
    console.error("SSE Error: Failed to parse formData", e);
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate: SendUpdateCallback = (data: StatusUpdate) => {
        try {
            controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
            // This can happen if the client has disconnected
            console.warn("SSE: Failed to enqueue data, client might have disconnected.", e);
        }
      };

      try {
        sendUpdate({ type: 'status', message: 'Stream connection established. Starting document processing...' });
        
        // Call the actual processing logic
        const result = await performDocumentProcessing(formData, systemPromptContent, optionalUserInput ?? "", sendUpdate);

        if (result.success) {
          // The 'result' type update with analysis is already sent by performDocumentProcessing
          // We just need to ensure the stream knows it's done.
          sendUpdate({ type: 'status', message: 'Processing completed successfully.'});
        } else {
          // Errors should have been sent by performDocumentProcessing via sendUpdate({type: 'error'})
          // This is a fallback or to signify the end of stream due to an error reported earlier.
          sendUpdate({ type: 'error', error: result.error || 'Processing failed after stream start.' });
        }
        
      } catch (error: any) {
        // This catch block handles errors thrown by performDocumentProcessing itself (e.g., unhandled exceptions)
        // or if performDocumentProcessing rejects without sending a specific error update.
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
      // Add any cleanup logic here, e.g., signal performDocumentProcessing to stop if possible
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