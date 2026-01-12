import backgroundImage from 'figma:asset/9197929f5990370d544e5e8702e52feaa65adfd8.png';

interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  isChatOpen: boolean;
}

export function TextEditor({ value, onChange, isChatOpen }: TextEditorProps) {
  return (
    <div 
      className={`flex-1 flex flex-col bg-[#faf8f5] transition-all relative ${isChatOpen ? 'border-r border-[#e8e3db]' : ''}`}
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center center',
        backgroundSize: '40%',
        backgroundAttachment: 'fixed',
      }}
    >
      <div 
        className="absolute inset-0 bg-[#faf8f5] pointer-events-none"
        style={{ opacity: 0.92 }}
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start writing or upload your manuscript..."
        className="flex-1 w-full px-12 py-8 resize-none focus:outline-none font-serif text-lg leading-relaxed text-[#3d3d3d] placeholder:text-[#a8a8a8] bg-transparent relative z-10"
        spellCheck={true}
      />
    </div>
  );
}