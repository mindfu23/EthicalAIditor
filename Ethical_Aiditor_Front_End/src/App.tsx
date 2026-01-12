import { useState, useRef } from 'react';
import { Header } from './components/Header';
import { EditorToolbar } from './components/EditorToolbar';
import { TextEditor } from './components/TextEditor';
import { ChatSidebar } from './components/ChatSidebar';

export default function App() {
  const [documentText, setDocumentText] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setDocumentText(text);
      };
      reader.readAsText(file);
    }
  };

  const handleSave = () => {
    const blob = new Blob([documentText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manuscript.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-[#faf8f5]">
      <Header />
      
      <EditorToolbar 
        onUpload={handleUpload}
        onSave={handleSave}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.doc,.docx"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex-1 flex overflow-hidden">
        <TextEditor 
          value={documentText}
          onChange={setDocumentText}
          isChatOpen={isChatOpen}
        />
        
        {isChatOpen && (
          <ChatSidebar documentText={documentText} />
        )}
      </div>
    </div>
  );
}