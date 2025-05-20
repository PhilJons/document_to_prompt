'use client';

import { useState, useRef, useEffect } from 'react';
// import { processDocumentsAction } from '@/actions/processDocuments'; // Old action, replaced by SSE
import { DocumentUploadForm } from '@/components/DocumentUploadForm';
import { ResultDisplay } from '@/components/ResultDisplay';
import Image from 'next/image'; // Keep if needed for branding
import { OptionsPanel } from '@/components/OptionsPanel';
import type { StatusUpdate } from '@/actions/processDocumentsLogic'; // Import StatusUpdate type

// const OPTIMISTIC_INTERVAL_MS = 2000; // Removed, progress is now backend-driven
const LOCAL_STORAGE_PROMPTS_KEY = 'customSystemPrompts';
const LOCAL_STORAGE_REQUEST_HISTORY_KEY = 'aiRequestHistory'; // New key for history

// Define the SystemPrompt interface (can be moved to a types file later)
interface SystemPrompt {
  name: string;
  content: string;
}

// Initial system prompt based on the existing one in processDocumentsAction
const initialDefaultPromptContent =
  `Your Role\nYou are an Expert Financial Analyst AI Assistant. Think and reason like a seasoned sell-side strategist with total command of equity-research lingo but the ability to translate it for a busy portfolio manager.

---

How the user would like to give its input to the AI
(User will provide input via uploaded documents and potentially an optional text note.)

---

Task Overview
Your primary goal now is to document the stance from *each* provided report extract within a chronological, house-by-house analysis, ensuring all source documents (<allFileNames/>) are acknowledged. This analysis synthesizes findings from <fileCount/> reports total. CRITICAL: Before starting, check the <optionalUserInput/> tag in the recap block. If it contains text, treat it as a priority directive that may override or refine other instructions.

---

Hidden Scratchpad (do NOT reveal):
1. Check <optionalUserInput/> first for any overriding instructions.
2. Parse input documents → tag each relevant block/finding with {house, year-Q, recommendation, TP, key drivers, filename}.
3. Build timeline per research house, mapping each report to its findings.
4. Identify key changes and continuities across the reports for each house.
5. Draft Executive TLDR focusing on major cross-house shifts or consensus points.
6. Draft detailed House Deep-Dive sections, ensuring chronological order and citation for each report.
7. Draft Appendix - Source Map.
8. Review against Style & Rules and word limits.

---

Output to user (visible):
### Executive TLDR (max ~150 words)
• 3-5 bullets summarizing the **biggest cross-house shifts or consensus points** observed across the reports.
• Each bullet ≤ 30 words.

### House Deep-Dive
#### {Research House A}
*(List chronologically based on report date/quarter, mentioning **each relevant report**)*
- **{Report Identifier e.g., 2023 Q2 - [filename]}**: (Key finding: e.g., Rec: Hold, TP: SEK 130. Maintained view on volume concerns) ‹file, p#›
- **{Report Identifier e.g., 2023 Q3 - [filename]}**: (Key finding: e.g., Rec: Hold → Hold, TP: 130 → 115 SEK (-11%). Cut forecasts on delayed recovery.) ‹file, p#›
- *(Continue for all reports attributed to this house)*
- **Overall trend:** One sentence summarizing the house\'s trajectory based on *all* its reports (≤ 25 words).
*(Repeat for every house present.)*

### Appendix – Source Map
Inline citation key: "‹filename, page›". List every citation once. Ensure all analysed reports contributing to the deep-dive are listed here.

---

Style & Rules:
• Write for an intelligent non-analyst; **limit jargon, no tables, no hedging**.
• Use active voice, plain verbs, short sentences/bullets per report.
• Bold the **Report Identifier** for scanability.
• If data unclear in a report write "n/a" for that point.
• Prioritize documenting each report\'s stance over extreme brevity within the deep-dive.

---

Iterative Refinement Note:
If this output isn't perfect, try editing the prompt to be more specific about the desired analysis points or output structure. Modern LLMs are highly steerable.
`;

const defaultSystemPrompts: SystemPrompt[] = [
  {
    name: "Default Financial Analyst",
    content: initialDefaultPromptContent,
  },
  {
    name: "Generic Summarizer",
    content:
`Your Role
You are an AI Assistant skilled at summarizing documents concisely.

---

How the user would like to give its input to the AI
(User will provide input via uploaded documents and potentially an optional text note.)

---

Task Overview
You will receive text extracted from <fileCount/> document(s) named: <allFileNames/>. Your goal is to extract the core message and key takeaways. IMPORTANT: Check the <optionalUserInput/> tag; if it contains instructions (e.g., focusing on a specific section, topic, or question), prioritize addressing those within your summary.

---

Hidden Scratchpad (do NOT reveal):
1. Read <optionalUserInput/> first for any specific focus.
2. Read through the extracted text from all documents.
3. Identify the main topic and key supporting points/arguments.
4. Draft a summary incorporating the key points, prioritizing any focus from <optionalUserInput/>.
5. Refine summary for clarity, conciseness, and adherence to word count (~100-200 words).
6. Ensure the summary is objective and based *only* on the provided text.

---

Output Format
Provide the summary as a single block of text. Start with a clear topic sentence.

---

Style & Rules
- Be objective and neutral.
- Focus *only* on the information presented in the text.
- Avoid adding external information or opinions.
- Adhere to the word count guidance (~100-200 words).

---

Iterative Refinement Note:
If the summary misses the mark, consider refining this prompt with more specific instructions on what to include or exclude, or adjusting the desired length.
`
  },
  {
    name: "Key Themes Extractor",
    content:
`Your Role
You are an AI Analyst specializing in identifying recurring themes and topics within large bodies of text.

---

How the user would like to give its input to the AI
(User will provide input via uploaded documents and potentially an optional text note.)

---

Task Overview
Analyze the text extracted from <fileCount/> document(s): <allFileNames/>. Identify the 3-5 most prominent or recurring themes discussed across the input. Prioritize themes related to any specific focus requested in <optionalUserInput/>.

---

Hidden Scratchpad (do NOT reveal):
1. Check <optionalUserInput/> for any priority topics.
2. Read through the extracted text, highlighting or noting recurring concepts, keywords, or ideas.
3. Group related concepts into potential themes.
4. Evaluate themes based on frequency, emphasis in the text, and relevance to <optionalUserInput/> focus.
5. Select the top 3-5 themes based on this evaluation.
6. For each selected theme, find a concise explanation or representative example from the text.
7. Format the output as a bulleted list.

---

Output Format
Present the output as a bulleted list. Each bullet point should name a key theme and provide a brief (1-2 sentence) explanation or example derived *directly* from the text.

Example:
*   **Theme Name 1:** Brief description/example from text.
*   **Theme Name 2:** Brief description/example from text.
*   ...

---

Style & Rules
- Clearly label each theme.
- Keep explanations concise and strictly based on the provided text.
- Prioritize themes that appear frequently or are central to the documents, giving extra weight if related to <optionalUserInput/>.

---

Iterative Refinement Note:
If the identified themes aren't relevant, try making this prompt more specific about the *type* of themes you are looking for (e.g., financial risks, strategic initiatives, customer feedback).
`
  }
  // Add any other non-deletable default prompts here
];

// Interface for request history items
interface RequestHistoryItem {
  id: string; // Unique ID for the request, e.g., timestamp + random string
  timestamp: string;
  promptName: string; // Name of the system prompt used
  fileName?: string; // Name of the (first) file processed, if applicable
  analysisSummary: string; // A short summary of the analysis
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const MAX_HISTORY_ITEMS = 20; // Max number of history items to store

export default function Home() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [processedText, setProcessedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optionalUserInput, setOptionalUserInput] = useState<string>(""); // New state for optional user input
  const [totalFilesToProcess, setTotalFilesToProcess] = useState<number>(0);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0); // Still useful for overall progress
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [currentStatusMessage, setCurrentStatusMessage] = useState<string | null>(null); // New state for SSE messages
  const [currentProgressPercent, setCurrentProgressPercent] = useState<number>(0); // For progress bar

  // isFinalizing can be inferred or set explicitly by a specific SSE message type
  // For now, we can set it when the stage moves to 'openai' or a similar overall step.
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false); 

  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState<boolean>(false);
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>(defaultSystemPrompts);
  const [selectedPromptName, setSelectedPromptName] = useState<string>(defaultSystemPrompts[0]?.name || "");

  // const eventSourceRef = useRef<EventSource | null>(null); // Removed

  // Load prompts from localStorage on initial mount
  useEffect(() => {
    try {
      const storedPromptsJson = localStorage.getItem(LOCAL_STORAGE_PROMPTS_KEY);
      if (storedPromptsJson) {
        const storedCustomPrompts = JSON.parse(storedPromptsJson) as SystemPrompt[];
        // Combine default prompts with stored custom prompts
        // Ensure default prompts are always present and unique by name
        const combinedPrompts = [...defaultSystemPrompts];
        storedCustomPrompts.forEach(storedPrompt => {
          if (!defaultSystemPrompts.some(dp => dp.name === storedPrompt.name)) {
            combinedPrompts.push(storedPrompt);
          }
        });
        setSystemPrompts(combinedPrompts);
        // If selected prompt was from localStorage and still exists, keep it, else default
        if (!combinedPrompts.some(p => p.name === selectedPromptName) && combinedPrompts.length > 0) {
          setSelectedPromptName(combinedPrompts[0].name);
        }
      } else {
         // Initialize localStorage with default prompts if nothing is stored
         // (or only store custom ones, here we store all for simplicity of retrieval)
         localStorage.setItem(LOCAL_STORAGE_PROMPTS_KEY, JSON.stringify(defaultSystemPrompts.filter(p => !defaultSystemPrompts.includes(p))));
      }
    } catch (error) {
      console.error("Failed to load prompts from localStorage:", error);
      // Fallback to default prompts if localStorage fails
      setSystemPrompts(defaultSystemPrompts);
      setSelectedPromptName(defaultSystemPrompts[0]?.name || "");
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Cleanup EventSource on component unmount
  // useEffect(() => { // Removed cleanup for eventSourceRef
  //   return () => {
  //     if (eventSourceRef.current) {
  //       eventSourceRef.current.close();
  //       eventSourceRef.current = null;
  //       console.log("SSE EventSource closed on unmount");
  //     }
  //   };
  // }, []);

  const handleUpload = async (formData: FormData) => {
    const files = formData.getAll("files") as File[];
    if (files.length === 0) return;

    const currentSelectedPrompt = systemPrompts.find(p => p.name === selectedPromptName);
    if (!currentSelectedPrompt) {
      setError("No system prompt selected or found. Please select a prompt.");
      setIsLoading(false);
      return;
    }

    // Append systemPromptContent to formData for the SSE route to parse
    formData.append('systemPromptContent', currentSelectedPrompt.content);
    formData.append('optionalUserInput', optionalUserInput); // Add optional user input to formData

    // Reset states
    setTotalFilesToProcess(files.length);
    setCurrentFileIndex(0); // Initialize, will be updated by SSE
    setCurrentFileName(files[0]?.name || ""); // Initial optimistic name
    setCurrentStatusMessage("Initiating process...");
    setCurrentProgressPercent(0);
    setIsLoading(true);
    setIsFinalizing(false);
    setError(null);
    setProcessedText(null);

    // if (eventSourceRef.current) { // Removed
    //   eventSourceRef.current.close(); 
    //   console.log("Previous SSE EventSource closed");
    // }

    console.log("Initiating SSE connection via fetch to /api/process-stream");
    // eventSourceRef.current = new EventSource('/api/process-stream', { withCredentials: true }); // Removed
    
    try {
      const response = await fetch('/api/process-stream', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorText = `Failed to connect to processing stream: ${response.statusText}`;
        try {
            const errDetails = await response.json();
            errorText = errDetails.error || errorText;
        } catch (e) { /* ignore if not json */ }
        throw new Error(errorText);
      }

      if (!response.body) {
        throw new Error("Response body is null, cannot read stream.");
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          console.log("SSE Stream finished.");
          break;
        }

        // SSE messages are `data: {JSON_STRING}\n\n`
        // There might be multiple messages in one chunk if they arrive quickly.
        const lines = value.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonString = line.substring('data: '.length);
            if (jsonString.trim()) { // Ensure not empty string
              try {
                const data: StatusUpdate = JSON.parse(jsonString);
                console.log("SSE Data Received:", data);

                // Update state based on message type
                if (data.message) setCurrentStatusMessage(data.message);
                if (data.totalFiles !== undefined) setTotalFilesToProcess(data.totalFiles);
                if (data.currentFileIndex !== undefined) setCurrentFileIndex(data.currentFileIndex);
                if (data.currentFileName !== undefined) setCurrentFileName(data.currentFileName);
                if (data.progressPercent !== undefined) setCurrentProgressPercent(data.progressPercent);
                
                if (data.stage === 'openai') setIsFinalizing(true);
                else if (data.type !== 'result' && data.type !== 'error') setIsFinalizing(false);

                if (data.type === 'result') {
                  setProcessedText(data.analysis || "");
                  setError(null);
                  setIsLoading(false);
                  setIsFinalizing(false);
                  setCurrentStatusMessage("Analysis complete.");

                  // Save to request history if tokenUsage is available
                  if (data.tokenUsage && data.analysis) {
                    const newHistoryItem: RequestHistoryItem = {
                      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                      timestamp: new Date().toISOString(),
                      promptName: selectedPromptName, // Assuming selectedPromptName is in scope and current
                      fileName: files[0]?.name, // Store the name of the first file as an example
                      analysisSummary: data.analysis.substring(0, 100) + (data.analysis.length > 100 ? "..." : ""),
                      tokenUsage: data.tokenUsage,
                    };

                    try {
                      const storedHistoryJson = localStorage.getItem(LOCAL_STORAGE_REQUEST_HISTORY_KEY);
                      let currentHistory: RequestHistoryItem[] = storedHistoryJson ? JSON.parse(storedHistoryJson) : [];
                      currentHistory.unshift(newHistoryItem); // Add new item to the beginning
                      currentHistory = currentHistory.slice(0, MAX_HISTORY_ITEMS); // Limit history size
                      localStorage.setItem(LOCAL_STORAGE_REQUEST_HISTORY_KEY, JSON.stringify(currentHistory));
                      console.log("Request history updated with token usage:", newHistoryItem);
                    } catch (lsError) {
                      console.error("Failed to save request history to localStorage:", lsError);
                    }
                  }
                } else if (data.type === 'error') {
                  setError(data.error || 'An unknown error occurred during processing.');
                  setProcessedText(null);
                  setIsLoading(false);
                  setIsFinalizing(false);
                  setCurrentStatusMessage("Processing failed.");
                }

              } catch (e) {
                console.error("Error parsing SSE JSON:", e, "Original string:", jsonString);
              }
            }
          }
        }
      }
    } catch (uploadError: any) {
      console.error("SSE Connection/Processing Error:", uploadError);
      setError(uploadError.message || "An unexpected error occurred.");
      setIsLoading(false);
      setIsFinalizing(false);
      setCurrentStatusMessage("Connection error or critical failure.");
    } finally {
      console.log("handleUpload finished.");
    }
  };

  const handleSelectSystemPrompt = (name: string) => {
    setSelectedPromptName(name);
  };

  const handleAddNewSystemPrompt = (name: string, content: string) => {
    // Check if prompt name already exists
    if (systemPrompts.some(prompt => prompt.name === name)) {
      alert(`A prompt with the name "${name}" already exists. Please use a different name.`);
      return;
    }
    const newPrompt: SystemPrompt = { name, content };
    setSystemPrompts(prevPrompts => {
      const updatedPrompts = [...prevPrompts, newPrompt];
      try {
        // Save only custom prompts to localStorage
        const customPromptsToStore = updatedPrompts.filter(
          p => !defaultSystemPrompts.some(dp => dp.name === p.name)
        );
        localStorage.setItem(LOCAL_STORAGE_PROMPTS_KEY, JSON.stringify(customPromptsToStore));
      } catch (error) {
        console.error("Failed to save prompts to localStorage:", error);
      }
      return updatedPrompts;
    });
    setSelectedPromptName(name); // Optionally select the new prompt automatically
  };

  const handleUpdateSystemPrompt = (originalName: string, newName: string, newContent: string) => {
    // Check for name conflict if the name has changed
    if (originalName !== newName && systemPrompts.some(prompt => prompt.name === newName)) {
      alert(`A prompt with the name "${newName}" already exists. Please use a different name.`);
      return;
    }

    setSystemPrompts(prevPrompts => {
      const updatedPrompts = prevPrompts.map(prompt =>
        prompt.name === originalName ? { name: newName, content: newContent } : prompt
      );
      try {
        const customPromptsToStore = updatedPrompts.filter(
          p => !defaultSystemPrompts.some(dp => dp.name === p.name)
        );
        localStorage.setItem(LOCAL_STORAGE_PROMPTS_KEY, JSON.stringify(customPromptsToStore));
      } catch (error) {
        console.error("Failed to update prompts in localStorage:", error);
      }
      return updatedPrompts;
    });

    // If the currently selected prompt was the one edited, update its name in selection
    if (selectedPromptName === originalName) {
      setSelectedPromptName(newName);
    }
  };

  const handleDeleteSystemPrompt = (nameToDelete: string) => {
    // Prevent deletion of default prompts
    if (defaultSystemPrompts.some(prompt => prompt.name === nameToDelete)) {
      alert("Default prompts cannot be deleted.");
      return;
    }

    setSystemPrompts(prevPrompts => {
      const updatedPrompts = prevPrompts.filter(prompt => prompt.name !== nameToDelete);
      try {
        // Save only custom prompts to localStorage
        const customPromptsToStore = updatedPrompts.filter(
          p => !defaultSystemPrompts.some(dp => dp.name === p.name)
        );
        localStorage.setItem(LOCAL_STORAGE_PROMPTS_KEY, JSON.stringify(customPromptsToStore));
      } catch (error) {
        console.error("Failed to save prompts to localStorage after deletion:", error);
      }
      const newSelectedPromptName = prevPrompts.some(p => p.name === selectedPromptName && p.name !== nameToDelete) 
        ? selectedPromptName 
        : defaultSystemPrompts[0]?.name || "";
      setSelectedPromptName(newSelectedPromptName);
      return updatedPrompts;
    });
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-8 sm:p-12 font-[family-name:var(--font-geist-sans)]">
      <header className="mb-10 text-center">
        {/* Optional: Add a logo or branding if desired */}
        {/* <Image
          className="dark:invert mx-auto mb-4"
          src="/your-logo.svg"
          alt="App Logo"
          width={180}
          height={38}
          priority
        /> */}
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Document Analysis Engine
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          Upload PDF research reports for AI-driven analysis of trends over time.
        </p>
        <button 
          onClick={() => setIsOptionsModalOpen(true)}
          className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          System Prompt Options
        </button>
      </header>

      <main className="w-full flex flex-col items-center gap-8">
        {/* Optional User Input Box */}
        <div className="w-full max-w-2xl">
          <label htmlFor="optional-user-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Optional User Input (provide additional context or specific instructions for the AI):
          </label>
          <textarea
            id="optional-user-input"
            value={optionalUserInput}
            onChange={(e) => setOptionalUserInput(e.target.value)}
            rows={5}
            className="block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            placeholder="e.g., Focus specifically on the outlook for Q4."
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            This input will be passed directly to the AI along with the selected system prompt and uploaded documents.
          </p>
        </div>

        {/* Document Upload Form */}
        <DocumentUploadForm onSubmit={handleUpload} isLoading={isLoading} />

        {/* Options Panel Modal */}
        {isOptionsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
            <div className="relative bg-white dark:bg-gray-800 p-0 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <OptionsPanel
                systemPrompts={systemPrompts}
                selectedPromptName={selectedPromptName}
                onSelectPrompt={handleSelectSystemPrompt}
                onAddNewPrompt={handleAddNewSystemPrompt}
                onDeletePrompt={handleDeleteSystemPrompt}
                onUpdatePrompt={handleUpdateSystemPrompt}
                defaultPromptNames={defaultSystemPrompts.map(p => p.name)}
                isLoading={isLoading}
                onClose={() => setIsOptionsModalOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Result Display Area */}
        <ResultDisplay
          processedText={processedText}
          isLoading={isLoading}
          error={error}
          totalFiles={totalFilesToProcess}
          currentFileIndex={currentFileIndex}
          currentFileName={currentFileName}
          currentStatusMessage={currentStatusMessage}
          isFinalizing={isFinalizing}
          progressPercent={currentProgressPercent}
        />
      </main>

      <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
        {/* Optional footer content */}
        Powered by Azure Document Intelligence & Azure OpenAI
      </footer>
    </div>
  );
}
