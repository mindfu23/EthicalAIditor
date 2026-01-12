import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface ChatSidebarProps {
  documentText: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function ChatSidebar({ documentText }: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your ethical AI writing assistant. I can help you review and edit your manuscript. Ask me about structure, pacing, character development, or anything else!'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue
    };

    setMessages(prev => [...prev, userMessage]);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I\'m a demo AI assistant. In the full application, I would provide helpful feedback on your writing based on ethical AI trained only on licensed content.'
      };
      setMessages(prev => [...prev, aiMessage]);
    }, 500);

    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-96 bg-[#f5f3ef] flex flex-col">
      <div className="px-6 py-4 border-b border-[#e8e3db] bg-[#faf8f5]">
        <h2 className="text-[#3d3d3d]">AI Assistant</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-[#8b9d8b] text-[#faf8f5]'
                  : 'bg-[#faf8f5] border border-[#e8e3db] text-[#3d3d3d]'
              }`}
            >
              <p className="text-sm leading-relaxed">{message.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[#e8e3db] bg-[#faf8f5]">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for feedback..."
            className="flex-1 px-4 py-2 border border-[#d4cec0] bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a8b5a8] focus:border-transparent text-[#3d3d3d] placeholder:text-[#a8a8a8]"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-[#8b9d8b] text-[#faf8f5] rounded-lg hover:bg-[#7a8c7a] transition-colors"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}