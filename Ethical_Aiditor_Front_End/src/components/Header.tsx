import { Settings, User } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b border-[#e8e3db] bg-[#faf8f5] px-6 py-4 flex items-center justify-between">
      <h1 className="font-serif text-2xl text-[#3d3d3d]">
        Ethical Aiditor
      </h1>
      
      <div className="flex items-center gap-4">
        <button 
          className="p-2 hover:bg-[#f0ebe3] rounded-lg transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5 text-[#6b6b6b]" />
        </button>
        
        <button 
          className="p-2 hover:bg-[#f0ebe3] rounded-lg transition-colors"
          aria-label="Account"
        >
          <User className="w-5 h-5 text-[#6b6b6b]" />
        </button>
      </div>
    </header>
  );
}