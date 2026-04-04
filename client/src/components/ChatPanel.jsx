import { useState, useEffect, useRef } from 'react';

export default function ChatPanel({ connection, messages, myUserId, onSend, onClose }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  };

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <div className="w-72 flex flex-col bg-gray-900 border-l border-gray-800 shrink-0">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-white font-medium text-sm truncate max-w-[160px]">
            {connection.username}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xl leading-none ml-2 shrink-0"
          title="Close chat"
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <div className="text-2xl mb-2">👋</div>
            <p className="text-gray-500 text-xs">
              You're close enough to chat with{' '}
              <span className="text-gray-400">{connection.username}</span>.<br />
              Say something!
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.userId === myUserId;
            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-[10px] text-gray-500 mb-0.5 ml-1">{msg.username}</span>
                )}
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-gray-800 text-gray-200 rounded-tl-sm'
                  }`}
                >
                  {msg.message}
                </div>
                <span className="text-[10px] text-gray-600 mt-0.5 mx-1">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-800 flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          maxLength={300}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1 min-w-0 bg-gray-800 text-white text-sm rounded-xl px-3 py-2 outline-none border border-gray-700 focus:border-indigo-500 transition placeholder-gray-600"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 rounded-xl text-sm font-medium transition shrink-0"
        >
          ↑
        </button>
      </div>

      {/* Proximity reminder */}
      <div className="px-3 pb-3 text-[10px] text-gray-600 text-center">
        Chat closes if you move too far apart
      </div>
    </div>
  );
}
