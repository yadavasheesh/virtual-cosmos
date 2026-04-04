import { useState } from 'react';
import CosmosCanvas from './components/CosmosCanvas';

export default function App() {
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    const name = inputVal.trim();
    if (!name) {
      setError('Please enter your name to continue.');
      return;
    }
    if (name.length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    setUsername(name);
    setJoined(true);
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-[#06061a] flex items-center justify-center relative overflow-hidden">
        {/* Background stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 80 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                width: Math.random() * 2 + 1 + 'px',
                height: Math.random() * 2 + 1 + 'px',
                top: Math.random() * 100 + '%',
                left: Math.random() * 100 + '%',
                opacity: Math.random() * 0.5 + 0.1,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 bg-gray-900/80 backdrop-blur border border-gray-800 p-10 rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🪐</div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Virtual Cosmos</h1>
            <p className="text-gray-400 text-sm mt-2">
              Move around, meet people, chat in real time
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Enter your name..."
                value={inputVal}
                maxLength={20}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition placeholder-gray-500 text-sm"
                autoFocus
              />
              {error && <p className="text-red-400 text-xs mt-2 ml-1">{error}</p>}
            </div>

            <button
              onClick={handleJoin}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition text-sm"
            >
              Enter the Cosmos
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-600 text-xs">Use WASD or arrow keys to move around</p>
          </div>
        </div>
      </div>
    );
  }

  return <CosmosCanvas username={username} />;
}
