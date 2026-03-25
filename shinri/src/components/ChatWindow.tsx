'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage, ImpactData } from '@/lib/types';

interface ChatWindowProps {
  open: boolean;
  onToggle: () => void;
  onImpactData: (data: ImpactData) => void;
}

export default function ChatWindow({ open, onToggle, onImpactData }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function sendMessage(text?: string) {
    const msg = text || input.trim();
    if (!msg || streaming) return;

    setInput('');
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    // Add status message
    const statusId = `status-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: statusId,
      role: 'status',
      content: 'Analyzing portfolio exposure...',
      timestamp: Date.now(),
    }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.filter(m => m.role !== 'status'),
        }),
      });

      if (!response.ok) throw new Error('Chat request failed');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      const assistantId = `assistant-${Date.now()}`;

      // Remove status, add empty assistant message
      setMessages(prev => [
        ...prev.filter(m => m.id !== statusId),
        { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() },
      ]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text') {
                assistantText += data.content;
                setMessages(prev =>
                  prev.map(m => m.id === assistantId ? { ...m, content: assistantText } : m)
                );
              }
            } catch {
              // Skip
            }
          }
        }
      }

      // Parse IMPACT_DATA from response
      const impactMatch = assistantText.match(/<!-- IMPACT_DATA: ({[\s\S]*?}) -->/);
      if (impactMatch) {
        try {
          const impactData: ImpactData = JSON.parse(impactMatch[1]);
          onImpactData(impactData);

          // Clean the impact data tag from displayed message
          const cleanText = assistantText.replace(/<!-- IMPACT_DATA: {[\s\S]*?} -->/, '').trim();
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: cleanText, impactData: impactData } : m)
          );
        } catch (e) {
          console.error('Failed to parse impact data:', e);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev.filter(m => m.id !== statusId),
        { id: `err-${Date.now()}`, role: 'assistant', content: 'Analysis failed. Please try again.', timestamp: Date.now() },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  // Suggested queries
  const suggestions = [
    'What if Maduro is ousted from Venezuela?',
    'Impact of US-Iran military escalation?',
    'How do Fed rate cuts affect our portfolio?',
    'China invades Taiwan — exposure analysis',
  ];

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-5 right-5 z-50 px-4 py-2.5 bg-panel border border-border rounded-full text-xs text-text hover:text-accent hover:border-border-light transition-all chat-glow group"
      >
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent/60 group-hover:bg-accent animate-pulse" />
          Ask Shinri
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[420px] h-[520px] bg-panel border border-border rounded-lg flex flex-col chat-glow overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
          <span className="text-xs font-medium text-text">Shinri Intelligence</span>
        </div>
        <button onClick={onToggle} className="text-text-muted hover:text-text text-xs">
          ESC
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3">Suggested Queries</div>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s)}
                className="block w-full text-left text-[11px] text-text/70 hover:text-accent px-3 py-2 rounded border border-border/50 hover:border-border transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'status') {
            return (
              <div key={msg.id} className="flex items-center gap-2 text-[10px] text-text-muted">
                <span className="w-1 h-1 rounded-full bg-text-muted animate-pulse" />
                {msg.content}
              </div>
            );
          }

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-lg bg-border text-[11px] text-text">
                  {msg.content}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex justify-start">
              <div className="max-w-[90%] text-[11px] text-text/85 leading-relaxed whitespace-pre-wrap">
                {msg.content || (
                  <span className="text-text-muted animate-pulse">Thinking...</span>
                )}
                {msg.impactData && (
                  <div className="mt-2 px-2 py-1.5 rounded bg-bg border border-border text-[10px]">
                    <div className="text-text-muted uppercase tracking-wider mb-1">Impact Summary</div>
                    <div className={`font-mono font-medium ${msg.impactData.portfolioImpact.totalDelta < 0 ? 'text-negative' : 'text-positive'}`}>
                      {msg.impactData.portfolioImpact.totalDelta < 0 ? '' : '+'}
                      ${(Math.abs(msg.impactData.portfolioImpact.totalDelta) / 1000000).toFixed(0)}M
                      ({(msg.impactData.portfolioImpact.totalDeltaPercent * 100).toFixed(2)}%)
                    </div>
                    <div className="text-text-muted mt-1">
                      {msg.impactData.affectedNodes.length} nodes affected, {msg.impactData.portfolioImpact.holdings.length} holdings impacted
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={streaming ? 'Analyzing...' : 'Ask about portfolio risk...'}
            disabled={streaming}
            className="flex-1 bg-bg border border-border rounded px-3 py-2 text-[11px] text-text placeholder-text-muted/50 focus:outline-none focus:border-border-light disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={streaming || !input.trim()}
            className="px-3 py-2 bg-bg border border-border rounded text-[11px] text-text-muted hover:text-accent hover:border-border-light transition-colors disabled:opacity-30"
          >
            {streaming ? '...' : '>'}
          </button>
        </div>
      </div>
    </div>
  );
}
