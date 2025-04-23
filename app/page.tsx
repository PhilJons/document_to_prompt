'use client';

import { useState, useRef, useEffect } from 'react';
import { processDocumentsAction } from '@/actions/processDocuments';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';
import { ResultDisplay } from '@/components/ResultDisplay';
import Image from 'next/image'; // Keep if needed for branding

const OPTIMISTIC_INTERVAL_MS = 2000; // ~2 seconds per file (adjust as needed)

export default function Home() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [processedText, setProcessedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalFilesToProcess, setTotalFilesToProcess] = useState<number>(0);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);

  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Function to safely clear interval
  const stopProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const handleUpload = async (formData: FormData) => {
    const files = formData.getAll("files") as File[];
    if (files.length === 0) return;

    const fileNames = files.map(f => f.name);
    setTotalFilesToProcess(files.length);
    setCurrentFileIndex(0);
    setCurrentFileName(fileNames[0] || "");
    setIsLoading(true);
    setIsFinalizing(false);
    setError(null);
    setProcessedText(null);

    stopProgressInterval(); // Clear previous interval if any

    // Start optimistic progress interval
    progressIntervalRef.current = setInterval(() => {
      setCurrentFileIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex < files.length) {
          // Still within the optimistic per-file count
          setCurrentFileName(fileNames[nextIndex] || "");
          return nextIndex;
        } else {
          // Reached the end of optimistic count
          stopProgressInterval(); // Stop the interval
          setIsFinalizing(true); // Switch to finalizing state
          return prevIndex; // Keep index at the last file
        }
      });
    }, OPTIMISTIC_INTERVAL_MS);

    console.log("Calling server action for analysis...");
    try {
      const result = await processDocumentsAction(formData);
      console.log("Server action analysis result:", result);

      if (result.success) {
        setProcessedText(result.analysis || "");
      } else {
        setError(result.error || 'An unknown error occurred during analysis.');
      }
    } catch (uploadError) {
        console.error("Upload/Processing Error:", uploadError);
        setError("An unexpected error occurred during processing.")
    } finally {
        stopProgressInterval(); // Ensure interval is stopped
        setIsLoading(false);
        setIsFinalizing(false); // Reset finalizing state
        // Optional: Reset progress state fully here if needed
        // setTotalFilesToProcess(0);
        // setCurrentFileIndex(0);
        // setCurrentFileName("");
    }
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
      </header>

      <main className="w-full flex flex-col items-center gap-8">
        {/* Document Upload Form */}
        <DocumentUploadForm onSubmit={handleUpload} isLoading={isLoading} />

        {/* Result Display Area */}
        <ResultDisplay
          processedText={processedText}
          isLoading={isLoading}
          error={error}
          totalFiles={totalFilesToProcess}
          currentFileIndex={currentFileIndex}
          currentFileName={currentFileName}
          isFinalizing={isFinalizing}
        />
      </main>

      <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
        {/* Optional footer content */}
        Powered by Azure Document Intelligence & Azure OpenAI
      </footer>
    </div>
  );
}
