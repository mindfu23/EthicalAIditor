import { Upload, Save, MessageSquare } from 'lucide-react';

interface EditorToolbarProps {
  onUpload: () => void;
  onSave: () => void;
  isChatOpen: boolean;
  onToggleChat: () => void;
}

export function EditorToolbar({ onUpload, onSave, isChatOpen, onToggleChat }: EditorToolbarProps) {
  return (
    <div className="border-b border-[#e8e3db] bg-[#f0ebe3] px-6 py-3 flex items-center gap-2">
      <button
        onClick={onUpload}
        className="flex items-center gap-2 px-4 py-2 text-[#5a5a5a] hover:bg-[#e3ddd1] rounded-lg transition-colors"
      >
        <Upload className="w-4 h-4" />
        <span>Upload</span>
      </button>
      
      <button
        onClick={onSave}
        className="flex items-center gap-2 px-4 py-2 text-[#5a5a5a] hover:bg-[#e3ddd1] rounded-lg transition-colors"
      >
        <Save className="w-4 h-4" />
        <span>Save</span>
      </button>

      <div className="flex-1" />

      <button
        onClick={onToggleChat}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
          isChatOpen 
            ? 'bg-[#a8b5a8] text-[#2d3d2d] hover:bg-[#9ca99c]' 
            : 'text-[#5a5a5a] hover:bg-[#e3ddd1]'
        }`}
      >
        <MessageSquare className="w-4 h-4" />
        <span>{isChatOpen ? 'Hide' : 'Show'} AI Assistant</span>
      </button>
    </div>
  );
}