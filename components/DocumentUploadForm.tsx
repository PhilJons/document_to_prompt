'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';

interface DocumentUploadFormProps {
  onUpload: (files: File[]) => void;
  isLoading: boolean;
}

export function DocumentUploadForm({ onUpload, isLoading }: DocumentUploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/bmp': ['.bmp'],
      'image/tiff': ['.tif', '.tiff'],
      // 'image/heic': ['.heic', '.heif'], // HEIC might need more specific handling or library support on client/server
      // Add other types Document Intelligence supports as needed, e.g., text/html, etc.
    },
  });

  const removeFile = (fileName: string) => {
    setFiles(files.filter((file) => file.name !== fileName));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (files.length === 0 || isLoading) return;

    onUpload(files);
    setFiles([]); // Clear files from the UI after initiating the upload process
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6">
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out
          ${
            isDragActive
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} disabled={isLoading} />
        {isDragActive ? (
          <p className="text-blue-600 dark:text-blue-400">Drop the files here ...</p>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center">
            Drag & drop PDF, Word, Excel, PowerPoint, or image files here, or click to select files
          </p>
        )}
         <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Accepts PDF, DOCX, XLSX, PPTX, JPG, PNG, BMP, TIFF</p>
      </div>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Selected files:</h3>
            <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1 max-h-40 overflow-y-auto pr-2">
              {files.map((file, index) => (
                <motion.li
                    key={`${file.name}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex justify-between items-center"
                >
                  <span>{file.name} <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span></span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.name)}
                    disabled={isLoading}
                    className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50"
                    aria-label={`Remove ${file.name}`}
                  >
                    Remove
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="submit"
        disabled={files.length === 0 || isLoading}
        className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-200"
        whileTap={{ scale: 0.98 }}
      >
        {isLoading ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2 align-middle"
          ></motion.div>
        ) : null}
        {isLoading ? 'Processing...' : `Process ${files.length} File(s)`}
      </motion.button>
    </form>
  );
} 