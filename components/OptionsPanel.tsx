'use client';

import React, { useState, useEffect } from 'react';
import { structureUserInputsIntoSystemPromptAction } from '@/actions/structureUserInputsIntoSystemPrompt';
import { motion } from 'framer-motion';

interface SystemPrompt {
  name: string;
  content: string;
}

interface OptionsPanelProps {
  systemPrompts: SystemPrompt[];
  selectedPromptName: string;
  onSelectPrompt: (name: string) => void;
  onAddNewPrompt: (name: string, content: string) => void;
  onDeletePrompt: (name: string) => void;
  onUpdatePrompt: (originalName: string, newName: string, newContent: string) => void;
  defaultPromptNames: string[];
  isLoading: boolean;
  onClose: () => void;
}

export function OptionsPanel({
  systemPrompts,
  selectedPromptName,
  onSelectPrompt,
  onAddNewPrompt,
  onDeletePrompt,
  onUpdatePrompt,
  defaultPromptNames,
  isLoading,
  onClose,
}: OptionsPanelProps) {
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [editingPromptOriginalName, setEditingPromptOriginalName] = useState<string | null>(null);
  const [isGeneratingAiPrompt, setIsGeneratingAiPrompt] = useState(false);
  const [aiGenerationError, setAiGenerationError] = useState<string | null>(null);

  const TEMPLATE_SYSTEM_PROMPT_TEMPLATE = `--- Who will receive this (audience) ---
(e.g., "Portfolio managers", "Investment committee", "Equity research team")

--- Background information ---
(e.g., "Analyzing quarterly earnings reports from several tech companies.", "Tracking analyst sentiment changes for a specific stock based on multiple research notes.")

--- Task definition, what you expect it to do, the vision ---
(e.g., "Summarize shifts in analyst ratings and price targets across the provided reports.", "Extract key themes and forward-looking statements from earnings call transcripts.", "Compare research house views on a company, highlighting changes over time and consensus points.")

--- How the user would like to give its input to the AI ---
(e.g., "I will paste the raw text directly.", "I will upload a PDF document.", "The information is in the following an excel sheet with columns X, Y, Z.")

--- Examples of good outputs (optional) ---
(e.g., "Imagine a previous analysis you liked – you can paste a snippet of its output here.", "Provide a full example text of a desired summary here.")

--- Desired output structure (optional) ---
(e.g., "A report with: 1. Executive TLDR (3-5 bullets). 2. Detailed breakdown by research house, showing report date, rating, price target, and key commentary. 3. Appendix listing sources.", "Output similar to the default financial analyst prompt\'s structure.", "Main sections: 'Overall Sentiment Shift', 'Key Themes by Research House', 'Price Target Evolution'.", "Output a list of key forecast changes with analyst justifications.")
`;

  useEffect(() => {
    if (editingPromptOriginalName) {
      const promptToEdit = systemPrompts.find(p => p.name === editingPromptOriginalName);
      if (promptToEdit) {
        setNewPromptName(promptToEdit.name);
        setNewPromptContent(promptToEdit.content);
      } else {
        setEditingPromptOriginalName(null);
      }
    }
  }, [editingPromptOriginalName, systemPrompts]);

  const handleAddOrUpdatePrompt = () => {
    if (newPromptName.trim() && newPromptContent.trim()) {
      if (editingPromptOriginalName) {
        onUpdatePrompt(editingPromptOriginalName, newPromptName.trim(), newPromptContent.trim());
        setEditingPromptOriginalName(null);
      } else {
        onAddNewPrompt(newPromptName.trim(), newPromptContent.trim());
      }
      setNewPromptName('');
      setNewPromptContent('');
    } else {
      alert('Please provide both a name and content for the prompt.');
    }
  };

  const handleSelectPromptForEditing = (prompt: SystemPrompt) => {
    setEditingPromptOriginalName(prompt.name);
  };

  const handleCancelEdit = () => {
    setEditingPromptOriginalName(null);
    setNewPromptName('');
    setNewPromptContent('');
  };

  const handleGenerateWithAi = async () => {
    if (!newPromptContent.trim()) {
      setNewPromptContent(TEMPLATE_SYSTEM_PROMPT_TEMPLATE);
      setAiGenerationError(null);
      return;
    }
    setIsGeneratingAiPrompt(true);
    setAiGenerationError(null);
    try {
      const result = await structureUserInputsIntoSystemPromptAction(newPromptContent);
      if (result.success && result.structuredPrompt) {
        setNewPromptContent(result.structuredPrompt);
      } else {
        setAiGenerationError(result.error || "Failed to structure prompt with AI. Unknown error.");
      }
    } catch (error: any) {
      setAiGenerationError(`An unexpected error occurred: ${error.message}`);
    } finally {
      setIsGeneratingAiPrompt(false);
    }
  };

  return (
    <div className="w-full p-6 bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-full">
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">System Prompt Options</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          aria-label="Close options panel"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto flex-grow pr-2 md:grid md:grid-cols-2 md:gap-6">
        <div className="flex flex-col space-y-6">
          <div className="">
            <label htmlFor="system-prompt-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Select an existing prompt:
            </label>
            <select
              id="system-prompt-select"
              value={selectedPromptName}
              onChange={(e) => onSelectPrompt(e.target.value)}
              disabled={isLoading}
              className="block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            >
              {systemPrompts.map((prompt) => (
                <option key={prompt.name} value={prompt.name}>
                  {prompt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="">
            <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-2">Manage Custom Prompts:</h3>
            {systemPrompts.filter(p => !defaultPromptNames.includes(p.name)).length > 0 ? (
              <ul className="space-y-2 max-h-60 md:max-h-none overflow-y-auto pr-2 border-t border-gray-200 dark:border-gray-700 pt-4">
                {systemPrompts
                  .filter(prompt => !defaultPromptNames.includes(prompt.name))
                  .map(prompt => (
                    <li key={prompt.name} className="flex justify-between items-center p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50">
                      <button
                        onClick={() => handleSelectPromptForEditing(prompt)}
                        className="text-sm text-left text-gray-700 dark:text-gray-300 hover:underline focus:outline-none flex-grow mr-2 disabled:opacity-50"
                        disabled={isLoading || !!editingPromptOriginalName}
                      >
                        {prompt.name}
                      </button>
                      <button
                        onClick={() => onDeletePrompt(prompt.name)}
                        disabled={isLoading || !!editingPromptOriginalName}
                        className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 bg-red-100 dark:bg-red-700/30 hover:bg-red-200 dark:hover:bg-red-600/40 rounded disabled:opacity-50 flex-shrink-0"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-4">No custom prompts added yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col space-y-4 mt-6 md:mt-0">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white">{editingPromptOriginalName ? 'Edit Prompt' : 'Add a new custom prompt'}:</h3>
          <div>
            <label htmlFor="new-prompt-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Prompt Name:
            </label>
            <input
              type="text"
              id="new-prompt-name"
              value={newPromptName}
              onChange={(e) => setNewPromptName(e.target.value)}
              disabled={isLoading}
              placeholder="e.g., Creative Story Writer"
              className="block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col flex-grow">
            <label htmlFor="new-prompt-content" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Prompt Content:
            </label>
            <textarea
              id="new-prompt-content"
              value={newPromptContent}
              onChange={(e) => setNewPromptContent(e.target.value)}
              disabled={isLoading}
              rows={20}
              placeholder="Enter the full system prompt here... or paste your thoughts and click 'Structure My Prompt'"
              className="block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 font-mono text-xs flex-grow"
            />
            {aiGenerationError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{aiGenerationError}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0 pt-2">
            <button
              type="button"
              onClick={handleAddOrUpdatePrompt}
              disabled={isLoading || isGeneratingAiPrompt || !newPromptName.trim() || !newPromptContent.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingPromptOriginalName ? 'Save Changes' : 'Add Custom Prompt'}
            </button>
            {editingPromptOriginalName && (
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isLoading || isGeneratingAiPrompt}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="button"
              onClick={handleGenerateWithAi}
              disabled={isLoading || isGeneratingAiPrompt}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isGeneratingAiPrompt ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                  ></motion.div>
                  Generating...
                </>
              ) : (
                !newPromptContent.trim() ? 'Insert Template' : 'Structure My Prompt'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 