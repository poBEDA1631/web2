import { useState } from 'react';
import axios from 'axios';
import { Send, Loader2 } from 'lucide-react';

const API_URL = 'http://localhost:3000';

export const CreateJobForm = ({ token, onJobCreated }) => {
  const [sourceUrl, setSourceUrl] = useState('');
  const [type, setType] = useState('Grayscale');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sourceUrl) {
      setError('Please provide a source URL');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post(
        `${API_URL}/jobs`,
        { sourceUrl, type },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSourceUrl('');
      if (onJobCreated) {
        onJobCreated(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create job');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 mb-8 transform transition-all hover:scale-[1.01]">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Send className="w-5 h-5 text-primary" />
        Create New Job
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4">
        <div className="flex-grow">
          <input
            type="url"
            placeholder="Image Source URL"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className="w-full bg-background/50 border border-white/10 rounded-lg px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
        <div className="w-full md:w-48">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-background/50 border border-white/10 rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all appearance-none"
          >
            <option value="Grayscale">Grayscale</option>
            <option value="Blur">Blur</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="bg-primary hover:bg-blue-600 text-primary-foreground font-medium rounded-lg px-6 py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating...
            </>
          ) : (
            'Submit Job'
          )}
        </button>
      </form>
      {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
    </div>
  );
};
