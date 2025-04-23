'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ResultDisplayProps {
  processedText: string | null;
  isLoading: boolean;
  error: string | null;
  totalFiles: number;
  currentFileIndex: number;
  currentFileName: string;
  isFinalizing: boolean;
}

export function ResultDisplay({
  processedText,
  isLoading,
  error,
  totalFiles,
  currentFileIndex,
  currentFileName,
  isFinalizing,
}: ResultDisplayProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const analysisContentRef = useRef<HTMLDivElement>(null); // Ref to capture the content area

  const handleCopy = async () => {
    if (analysisContentRef.current) {
      try {
        const htmlContent = analysisContentRef.current.innerHTML;
        const textContent = analysisContentRef.current.innerText; // Plain text fallback

        // Create Blob objects for different formats
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([textContent], { type: 'text/plain' });

        // Use the ClipboardItem API to provide both formats
        const clipboardItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        });

        await navigator.clipboard.write([clipboardItem]);
        setIsCopied(true);

      } catch (err) {
        console.error('Failed to copy rich text using ClipboardItem API: ', err);
        // Fallback to copying plain text if ClipboardItem fails (e.g., browser support)
        try {
            console.log("Falling back to copying plain text.");
            await navigator.clipboard.writeText(analysisContentRef.current.innerText);
            setIsCopied(true); // Still indicate success if text fallback works
        } catch (fallbackErr) {
            console.error('Failed to copy even plain text: ', fallbackErr);
        }
      }
    } else {
      console.error('Analysis content ref not found for copying');
    }
  };

  // Reset copy status when text changes
  useEffect(() => {
    setIsCopied(false);
  }, [processedText]);

  // Reset copy button text after a delay
  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false);
      }, 2000); // Reset after 2 seconds
      return () => clearTimeout(timer);
    }
  }, [isCopied]);

  const handleDownloadPdf = async () => {
    if (!processedText) return;
    setIsDownloading(true);

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markdown: processedText }),
      });

      if (!response.ok) {
        // Try to parse error message from API if available
        let errorDetails = `Server responded with status ${response.status}`;
        try {
          const errorJson = await response.json();
          errorDetails = errorJson.error || errorJson.details || errorDetails;
        } catch (e) {
          // Ignore if response is not JSON
        }
        throw new Error(`Failed to generate PDF: ${errorDetails}`);
      }

      // Get the PDF blob from the response
      const blob = await response.blob();

      // Create a link element to trigger the download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'analysis-result.pdf'); // or any other filename
      document.body.appendChild(link);
      link.click();

      // Clean up the URL and link
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (err: any) {
      console.error("Error downloading PDF:", err);
      // You might want to show an error message to the user here
      alert(`Failed to download PDF: ${err.message}`); 
    } finally {
      setIsDownloading(false);
    }
  };

  // Calculate optimistic progress percentage
  const progressPercent = totalFiles > 0 ? Math.min(100, Math.round(((currentFileIndex + 1) / totalFiles) * 100)) : 0;

  return (
    <div className="w-full max-w-4xl mt-8">
      <AnimatePresence mode="wait">
        {isLoading && (
          isFinalizing ? (
            <motion.div
              key="finalizing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-3"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full mb-2"
              ></motion.div>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                Analyzing results...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please wait while we process the extracted data.
              </p>
            </motion.div>
          ) : totalFiles > 0 ? (
            <motion.div
              key="loading-progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-3"
            >
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                Processing file {currentFileIndex + 1} of {totalFiles}...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate w-full text-center px-4">
                {currentFileName}
              </p>
              {/* Progress Bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5 overflow-hidden">
                <motion.div
                  className="bg-blue-600 h-2.5 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.5, ease: "easeInOut" }} // Smooth animation
                />
              </div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">{progressPercent}%</p>
            </motion.div>
          ) : null
        )}

        {error && !isLoading && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 border border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
          >
            <p className="font-medium">Error:</p>
            <p>{error}</p>
          </motion.div>
        )}

        {processedText && !isLoading && !error && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm"
          >
            <div className="absolute top-2 right-2 z-10 flex gap-2">
              <button
                onClick={handleCopy}
                disabled={isDownloading}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors duration-200 disabled:opacity-50 ${isCopied ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'}`}
              >
                {isCopied ? 'Copied!' : 'Copy Analysis'}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="px-3 py-1 text-xs font-medium rounded transition-colors duration-200 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {isDownloading ? 'Downloading...' : 'Download PDF'}
              </button>
            </div>
            <div 
              ref={analysisContentRef} 
              className="p-6 pt-10 prose prose-sm dark:prose-invert max-w-none max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {processedText}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
} 