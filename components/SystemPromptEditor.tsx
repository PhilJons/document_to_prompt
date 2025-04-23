'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface SystemPromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt: string;
  onSave: (newPrompt: string) => void;
}

export default function SystemPromptEditor({
  isOpen,
  onClose,
  currentPrompt,
  onSave,
}: SystemPromptEditorProps) {
  const [editedPrompt, setEditedPrompt] = useState(currentPrompt);

  // Update local state if the currentPrompt prop changes externally
  useEffect(() => {
    setEditedPrompt(currentPrompt);
  }, [currentPrompt]);

  const handleSave = () => {
    onSave(editedPrompt);
    onClose(); // Close the dialog after saving
  };

  // Use Dialog open and onOpenChange for controlled state
  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Analysis Prompt Template</DialogTitle>
          <DialogDescription>
            Modify the template used to instruct the AI. Use `{'{'}{'{'}CONCISE_DOCUMENTS_DATA{'}'}{'}'}` 
            as a placeholder where the extracted document data will be injected.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 flex-grow overflow-y-auto">
          <div className="grid grid-cols-1 items-center gap-4">
            <Label htmlFor="prompt-template" className="sr-only">
              Prompt Template
            </Label>
            <Textarea
              id="prompt-template"
              value={editedPrompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditedPrompt(e.target.value)}
              className="min-h-[300px] flex-grow font-mono text-sm resize-none"
              placeholder="Enter the analysis prompt template here..."
            />
          </div>
        </div>
        <DialogFooter>
           <DialogClose asChild>
             <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
           </DialogClose>
          <Button type="button" onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 