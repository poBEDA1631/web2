import { useState } from 'react';
import axios from 'axios';
import { useSocket } from './hooks/useSocket';
import { CreateJobForm } from './components/CreateJobForm';
import { JobList } from './components/JobList';
import { Image as ImageIcon, Wifi, WifiOff, LogOut, KeyRound, Layers } from 'lucide-react';

const API_URL = 'http://localhost:3000';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [userId, setUserId] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [triggerRefresh, setTriggerRefresh] = useState(0);

  const { isConnected, lastMessage } = useSocket(token);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!userId) return;
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await axios.post(`${API_URL}/auth/login`, { userId });
      const newToken = response.data.token;
      setToken(newToken);
      localStorage.setItem('token', newToken);
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('token');
  };

  const handleJobCreated = () => {
    // We update triggerRefresh to cause JobList to re-fetch if needed,
    // though realistically, a new job creation can also be prepended locally.
    setTriggerRefresh((prev) => prev + 1);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="glass max-w-md w-full rounded-3xl p-8 relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4 shadow-lg shadow-primary/20">
              <ImageIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              AI Image Processor
            </h1>
            <p className="text-muted-foreground mt-2">Enter your User ID to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <KeyRound className="w-5 h-5 text-muted-foreground" />
              </div>
              <input
                type="text"
                placeholder="User ID (e.g. user123)"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full bg-background/50 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-primary hover:bg-blue-600 text-primary-foreground font-semibold rounded-xl px-4 py-4 flex justify-center transition-all disabled:opacity-50 active:scale-[0.98]"
            >
              {isLoggingIn ? 'Connecting...' : 'Access Dashboard'}
            </button>
            {loginError && <p className="text-destructive text-center text-sm">{loginError}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 relative">
      {/* Background decoration */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Navbar */}
      <nav className="glass sticky top-0 z-50 border-b border-white/5 bg-background/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-primary to-accent p-2 rounded-xl">
                <ImageIcon className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">ImagePro</span>
            </div>
            <div className="flex items-center gap-6">
              <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                {isConnected ? (
                  <><Wifi className="w-4 h-4" /> Connected</>
                ) : (
                  <><WifiOff className="w-4 h-4" /> Disconnected</>
                )}
              </div>
              <button 
                onClick={handleLogout}
                className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Manage your image processing tasks in real-time.</p>
        </div>

        <CreateJobForm token={token} onJobCreated={handleJobCreated} />
        
        <div className="mt-12">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Recent Jobs
          </h2>
          {/* We pass a key to force re-render/re-fetch if we explicitly want to, though real-time updates handle most of it */}
          <JobList key={triggerRefresh} token={token} lastWebSocketMessage={lastMessage} />
        </div>
      </main>
    </div>
  );
}

export default App;
