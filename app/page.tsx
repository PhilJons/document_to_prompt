'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';
import { ResultDisplay } from '@/components/ResultDisplay';
import Image from 'next/image'; // Keep if needed for branding
import { OptionsPanel } from '@/components/OptionsPanel';
import type { StatusUpdate } from '@/actions/processDocumentsLogic'; // Import StatusUpdate type
import AuthButton from '@/components/AuthButton'; // Added AuthButton import

// const OPTIMISTIC_INTERVAL_MS = 2000; // Removed, progress is now backend-driven
const LOCAL_STORAGE_REQUEST_HISTORY_KEY = 'aiRequestHistory'; // New key for history

// Define the SystemPrompt interface (can be moved to a types file later)
interface SystemPrompt {
  id: number; // Added id, will come from DB
  name: string;
  content: string;
  // userId: string; // Not needed on frontend model if only showing own prompts
  // createdAt: string; // Or Date, if needed for display/sorting
  // updatedAt: string; // Or Date
}

// Define initialDefaultPromptContent first
const initialDefaultPromptContent =
  `Your Role\nYou are an Expert Financial Analyst AI Assistant. Think and reason like a seasoned sell-side strategist with total command of equity-research lingo but the ability to translate it for a busy portfolio manager.\n\n---\n\nHow the user would like to give its input to the AI\n(User will provide input via uploaded documents and potentially an optional text note.)\n\n---\n\nTask Overview\nYour primary goal now is to document the stance from *each* provided report extract within a chronological, house-by-house analysis, ensuring all source documents (<allFileNames/>) are acknowledged. This analysis synthesizes findings from <fileCount/> reports total. CRITICAL: Before starting, check the <optionalUserInput/> tag in the recap block. If it contains text, treat it as a priority directive that may override or refine other instructions.\n\n---\n\nHidden Scratchpad (do NOT reveal):\n1. Check <optionalUserInput/> first for any overriding instructions.\n2. Parse input documents → tag each relevant block/finding with {house, year-Q, recommendation, TP, key drivers, filename}.\n3. Build timeline per research house, mapping each report to its findings.\n4. Identify key changes and continuities across the reports for each house.\n5. Draft Executive TLDR focusing on major cross-house shifts or consensus points.\n6. Draft detailed House Deep-Dive sections, ensuring chronological order and citation for each report.\n7. Draft Appendix - Source Map.\n8. Review against Style & Rules and word limits.\n\n---\n\nOutput to user (visible):\n### Executive TLDR (max ~150 words)\n• 3-5 bullets summarizing the **biggest cross-house shifts or consensus points** observed across the reports.\n• Each bullet ≤ 30 words.\n\n### House Deep-Dive\n#### {Research House A}\n*(List chronologically based on report date/quarter, mentioning **each relevant report**)*\n- **{Report Identifier e.g., 2023 Q2 - [filename]}**: (Key finding: e.g., Rec: Hold, TP: SEK 130. Maintained view on volume concerns) ‹file, p#›\n- **{Report Identifier e.g., 2023 Q3 - [filename]}**: (Key finding: e.g., Rec: Hold → Hold, TP: 130 → 115 SEK (-11%). Cut forecasts on delayed recovery.) ‹file, p#›\n- *(Continue for all reports attributed to this house)*\n- **Overall trend:** One sentence summarizing the house\'s trajectory based on *all* its reports (≤ 25 words).\n*(Repeat for every house present.)*\n\n### Appendix – Source Map\nInline citation key: \"‹filename, page›\". List every citation once. Ensure all analysed reports contributing to the deep-dive are listed here.\n\n---\n\nStyle & Rules:\n• Write for an intelligent non-analyst; **limit jargon, no tables, no hedging**.\n• Use active voice, plain verbs, short sentences/bullets per report.\n• Bold the **Report Identifier** for scanability.\n• If data unclear in a report write \"n/a\" for that point.\n• Prioritize documenting each report\'s stance over extreme brevity within the deep-dive.\n\n---\n\nIterative Refinement Note:\nIf this output isn\'t perfect, try editing the prompt to be more specific about the desired analysis points or output structure. Modern LLMs are highly steerable.\n`;

// Now define initialDefaultPromptsSeedData using the above constant
const initialDefaultPromptsSeedData: Omit<SystemPrompt, 'id'>[] = [
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
  const { data: session, status: sessionStatus } = useSession();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [processedText, setProcessedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optionalUserInput, setOptionalUserInput] = useState<string>("");
  const [totalFilesToProcess, setTotalFilesToProcess] = useState<number>(0);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [currentStatusMessage, setCurrentStatusMessage] = useState<string | null>(null);
  const [currentProgressPercent, setCurrentProgressPercent] = useState<number>(0);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState<boolean>(false);

  // SystemPrompts state will now be fetched from the API
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [selectedPromptName, setSelectedPromptName] = useState<string>("");
  const [isLoadingPrompts, setIsLoadingPrompts] = useState<boolean>(false);

  // Store the names of the initial default prompts that were seeded.
  // This helps in UI to potentially mark them or prevent deletion if desired.
  const defaultPromptNamesFromSeed = initialDefaultPromptsSeedData.map(p => p.name);

  // Fetch prompts when user session is available
  useEffect(() => {
    const fetchPrompts = async () => {
      if (session?.user?.id) {
        setIsLoadingPrompts(true);
        try {
          const response = await fetch('/api/prompts');
          if (!response.ok) {
            throw new Error(`Failed to fetch prompts: ${response.statusText}`);
          }
          const prompts: SystemPrompt[] = await response.json();
          setSystemPrompts(prompts);
          if (prompts.length > 0 && !prompts.some(p => p.name === selectedPromptName)) {
            setSelectedPromptName(prompts[0].name);
          } else if (prompts.length === 0) {
            setSelectedPromptName("");
          }
        } catch (err: any) {
          console.error("Error fetching prompts:", err);
          setError("Could not load your prompt templates. Please try again later.");
          setSystemPrompts([]);
        } finally {
          setIsLoadingPrompts(false);
        }
      } else {
        // No session, clear prompts or set to a default non-user specific list if desired
        setSystemPrompts([]);
        setSelectedPromptName("");
      }
    };

    if (sessionStatus === 'authenticated') {
      fetchPrompts();
    } else if (sessionStatus === 'unauthenticated') {
      setSystemPrompts([]);
      setSelectedPromptName("");
      // Optionally, could load some global/readonly defaults if the app supports that for unauth users
    }
    // Re-fetch if session changes (e.g. login/logout)
  }, [session, sessionStatus]);

  const handleUpload = async (formData: FormData) => {
    const files = formData.getAll("files") as File[];
    if (files.length === 0) return;

    const currentSelectedPrompt = systemPrompts.find(p => p.name === selectedPromptName);
    if (!currentSelectedPrompt) {
      setError("No system prompt selected or found. Please select or create a prompt.");
      setIsLoading(false);
      return;
    }

    // Append systemPromptContent to formData for the SSE route to parse
    formData.append('systemPromptContent', currentSelectedPrompt.content);
    formData.append('optionalUserInput', optionalUserInput);

    setTotalFilesToProcess(files.length);
    setCurrentFileIndex(0);
    setCurrentFileName(files[0]?.name || "");
    setCurrentStatusMessage("Initiating process...");
    setCurrentProgressPercent(0);
    setIsLoading(true);
    setIsFinalizing(false);
    setError(null);
    setProcessedText(null);

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
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          console.log("SSE Stream finished.");
          break;
        }

        const lines = value.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonString = line.substring('data: '.length);
            if (jsonString.trim()) {
              try {
                const data: StatusUpdate = JSON.parse(jsonString);
                console.log("SSE Data Received:", data);

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

  const handleAddNewSystemPrompt = async (name: string, content: string) => {
    if (!session?.user?.id) {
      alert("You must be logged in to add new prompts.");
      return;
    }
    // Client-side check for existing name (optional, server enforces unique constraint too)
    if (systemPrompts.some(prompt => prompt.name === name)) {
      alert(`A prompt with the name "${name}" already exists. Please use a different name.`);
      return;
    }
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Failed to add prompt: ${response.statusText}`);
      }
      const newPrompt: SystemPrompt = await response.json();
      setSystemPrompts(prevPrompts => [...prevPrompts, newPrompt]);
      setSelectedPromptName(newPrompt.name);
    } catch (err: any) {
      console.error("Error adding new prompt:", err);
      alert(`Error adding prompt: ${err.message}`);
    }
  };

  const handleUpdateSystemPrompt = async (originalName: string, newName: string, newContent: string) => {
    if (!session?.user?.id) {
      alert("You must be logged in to update prompts.");
      return;
    }
    const promptToUpdate = systemPrompts.find(p => p.name === originalName);
    if (!promptToUpdate) {
      alert("Prompt to update not found.");
      return;
    }

    // Client-side check for name conflict (optional, server enforces unique constraint too)
    if (originalName !== newName && systemPrompts.some(prompt => prompt.name === newName && prompt.id !== promptToUpdate.id)) {
      alert(`Another prompt with the name "${newName}" already exists. Please use a different name.`);
      return;
    }

    try {
      const response = await fetch(`/api/prompts/${promptToUpdate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, content: newContent }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Failed to update prompt: ${response.statusText}`);
      }
      const updatedPrompt: SystemPrompt = await response.json();
      setSystemPrompts(prevPrompts =>
        prevPrompts.map(p => (p.id === updatedPrompt.id ? updatedPrompt : p))
      );
      if (selectedPromptName === originalName) {
        setSelectedPromptName(updatedPrompt.name);
      }
    } catch (err: any) {
      console.error("Error updating prompt:", err);
      alert(`Error updating prompt: ${err.message}`);
    }
  };

  const handleDeleteSystemPrompt = async (nameToDelete: string) => {
    if (!session?.user?.id) {
      alert("You must be logged in to delete prompts.");
      return;
    }

    // Prevent deletion of initial default prompts if desired (using names for now)
    // This is a UI-level prevention. The backend allows deletion of any owned prompt.
    if (defaultPromptNamesFromSeed.includes(nameToDelete)) {
      alert("Seeded default prompts cannot be deleted from the UI in this version.");
      // You could choose to allow deletion by removing this check, 
      // or add an 'isDeletable' or 'isDefault' flag from the backend to control this more granularly.
      return;
    }

    const promptToDelete = systemPrompts.find(p => p.name === nameToDelete);
    if (!promptToDelete) {
      alert("Prompt to delete not found.");
      return;
    }

    if (window.confirm(`Are you sure you want to delete the prompt "${nameToDelete}"?`)) {
      try {
        const response = await fetch(`/api/prompts/${promptToDelete.id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `Failed to delete prompt: ${response.statusText}`);
        }
        setSystemPrompts(prevPrompts => prevPrompts.filter(p => p.id !== promptToDelete.id));
        if (selectedPromptName === nameToDelete) {
          setSelectedPromptName(systemPrompts.length > 1 ? systemPrompts.find(p => p.id !== promptToDelete.id)?.name || '' : '');
        }
      } catch (err: any) {
        console.error("Error deleting prompt:", err);
        alert(`Error deleting prompt: ${err.message}`);
      }
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-8 sm:p-24 pt-24 font-[family-name:var(--font-geist-sans)] relative">
      <div className="fixed top-4 right-4 z-50">
        <AuthButton />
      </div>

      <header className="mb-10 text-center w-full">
        {/* Aura Logos - Conditional rendering for dark mode */}
        <div className="mx-auto mb-6" style={{ maxWidth: '200px' }}> {/* Added a wrapper for sizing and centering */}
          <Image 
            src="/Aura_logo.svg" 
            alt="Aura Logo" 
            width={150} 
            height={44} // Adjust height based on aspect ratio of 150 width
            className="mx-auto block dark:hidden"
            priority 
          />
          <Image 
            src="/Aura_logo_white.svg" 
            alt="Aura Logo" 
            width={150} 
            height={44} // Adjust height based on aspect ratio of 200 width
            className="mx-auto hidden dark:block"
            priority
          />
        </div>
        
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Document Analysis Engine
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          Upload PDF research reports for AI-driven analysis of trends over time.
        </p>
        <button 
          onClick={() => setIsOptionsModalOpen(true)}
          disabled={sessionStatus === 'loading' || isLoadingPrompts} // Disable if loading session or prompts
          className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isLoadingPrompts ? "Loading Prompts..." : "System Prompt Options"}
        </button>
      </header>

      <main className="w-full flex flex-col items-center gap-8">
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

        <DocumentUploadForm onSubmit={handleUpload} isLoading={isLoading || sessionStatus === 'loading'} />

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
                defaultPromptNames={defaultPromptNamesFromSeed}
                isLoading={isLoadingPrompts || isLoading}
                onClose={() => setIsOptionsModalOpen(false)}
                isUserLoggedIn={sessionStatus === 'authenticated'}
              />
            </div>
          </div>
        )}

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
        Powered by Azure Document Intelligence & Azure OpenAI
      </footer>
    </div>
  );
}
