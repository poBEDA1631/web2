import { useEffect, useState } from 'react';
import axios from 'axios';
import { JobCard } from './JobCard';
import { Layers, Loader2 } from 'lucide-react';

const API_URL = 'http://localhost:3000';

export const JobList = ({ token, lastWebSocketMessage }) => {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/jobs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJobs(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [token]);

  // Handle real-time updates from WebSocket
  useEffect(() => {
    if (lastWebSocketMessage) {
      const { jobId, status, resultUrl } = lastWebSocketMessage;
      setJobs((prevJobs) =>
        prevJobs.map((job) =>
          job.id === jobId ? { ...job, status, resultUrl } : job
        )
      );
    }
  }, [lastWebSocketMessage]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 text-destructive p-4 rounded-lg border border-destructive/20 text-center">
        {error}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="glass rounded-2xl p-12 text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <Layers className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-medium mb-2">No jobs yet</h3>
        <p className="text-muted-foreground">Create your first processing job above.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} token={token} />
      ))}
    </div>
  );
};
