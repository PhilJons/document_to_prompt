'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';
import { ResultDisplay } from '@/components/ResultDisplay';
import { processDocumentsAction, getDefaultAnalysisPrompt } from '@/actions/processDocuments'; 
import { Button } from "@/components/ui/button"; // Assuming Button is used
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal } from "lucide-react"
import SystemPromptEditor from '@/components/SystemPromptEditor'; // Import the editor

// Assuming SystemPromptEditor component will be created later
// import SystemPromptEditor from '@/components/SystemPromptEditor';

export default function Home() {
  const [processedText, setProcessedText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileName, setCurrentFileName] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // State for the analysis prompt template
  const [analysisPromptTemplate, setAnalysisPromptTemplate] = useState<string>("");
  const [promptLoading, setPromptLoading] = useState(true);
  const [promptError, setPromptError] = useState<string | null>(null);

  // State for the editor popup
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false);

  // Fetch the default prompt on component mount
  useEffect(() => {
    async function fetchPrompt() {
      try {
        setPromptLoading(true);
        const defaultPrompt = await getDefaultAnalysisPrompt();
        setAnalysisPromptTemplate(defaultPrompt);
        setPromptError(null);
      } catch (err) {
        console.error("Failed to fetch default prompt:", err);
        setPromptError("Could not load the default analysis prompt.");
        setAnalysisPromptTemplate("Error loading prompt..."); // Placeholder on error
      } finally {
        setPromptLoading(false);
      }
    }
    fetchPrompt();
  }, []); // Empty dependency array ensures this runs only once on mount

  // This handler now needs to align with DocumentUploadForm's output
  // Assuming DocumentUploadForm calls an onSubmit prop with FormData
  const handleUploadSubmit = async (formData: FormData) => {
    const files = formData.getAll("files") as File[];
    if (files.length === 0) {
       setError("No files submitted.");
       return;
    } 
    // Set state based on the submitted files
    setUploadedFiles(files);
    setProcessedText(null);
    setError(null);
    setTotalFiles(files.length);
    setCurrentFileIndex(0);
    setCurrentFileName(files.length > 0 ? files[0].name : "");
    setIsFinalizing(false); 

    // Immediately proceed to analysis after form gives us the FormData
    await performAnalysis(formData);
  };

  // Extracted analysis logic to be called after getting FormData
  const performAnalysis = async (formData: FormData) => {
    setIsLoading(true);
    // Optional: remove the simulated progress loop if form handles it?
    // Or keep it if the form only gives files, not submits them
    setIsFinalizing(true); // Go straight to finalizing/analysis

    try {
      const result = await processDocumentsAction(formData, analysisPromptTemplate);
      if (result.success && result.analysis) {
        setProcessedText(result.analysis);
        setError(null);
      } else {
        setError(result.error || "An unknown error occurred.");
        setProcessedText(null);
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      setError(`An unexpected error occurred during analysis: ${err.message || "Unknown error"}`);
      setProcessedText(null);
    } finally {
      setIsLoading(false);
      setIsFinalizing(false); 
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6 sm:p-12 md:p-24 bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-900/30">
      <div className="w-full max-w-4xl bg-white dark:bg-gray-800 shadow-xl rounded-lg p-8 border border-gray-200 dark:border-gray-700">
        
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-800 dark:text-gray-100">
          Quarterly Report Analysis Synthesis
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          Upload multiple quarterly equity research PDF reports to analyze and synthesize their evolution.
        </p>

        {/* Prompt Loading/Error State */}
        {promptLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 my-2">Loading analysis prompt...</p>}
        {promptError && (
          <Alert variant="destructive" className="my-4">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Prompt Error</AlertTitle>
            <AlertDescription>{promptError}</AlertDescription>
          </Alert>
        )}

        {/* Button to open prompt editor */}
        <div className="flex justify-end mb-4">
           <Button 
             variant="outline" 
             size="sm" 
             onClick={() => setIsPromptEditorOpen(true)}
             disabled={promptLoading || !!promptError} // Disable if loading or error
           >
             Edit Analysis Prompt
           </Button>
        </div> 

        {/* Replace FileUploader usage with DocumentUploadForm */}
        {/* Pass the new handleUploadSubmit handler */}
        {/* Remove the separate form tag and submit button if DocumentUploadForm includes them */}
        <DocumentUploadForm 
           onSubmit={handleUploadSubmit} 
           isLoading={isLoading} 
           // Pass other necessary props based on DocumentUploadForm's definition
        />
        
        {(error || processedText || isLoading) && (
          <div className="mt-8 w-full">
            <ResultDisplay
              processedText={processedText}
              isLoading={isLoading}
              error={error}
              totalFiles={totalFiles}
              currentFileIndex={currentFileIndex}
              currentFileName={currentFileName}
              isFinalizing={isFinalizing}
            />
          </div>
        )}
      </div>

      {/* Prompt Editor Modal */}
      {isPromptEditorOpen && (
        <SystemPromptEditor
          isOpen={isPromptEditorOpen}
          onClose={() => setIsPromptEditorOpen(false)}
          currentPrompt={analysisPromptTemplate} // Pass the prompt from state
          onSave={(newPrompt) => {
            setAnalysisPromptTemplate(newPrompt); // Update state on save
          }}
        />
      )} 

    </main>
  );
}
