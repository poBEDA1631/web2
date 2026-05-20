import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import axios from 'axios';
import { useState } from 'react';

export const JobCard = ({ job, token }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleViewResult = async (e) => {
    e.preventDefault();
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await axios.get(`http://localhost:3000/jobs/${job.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      window.open(response.data.downloadUrl, '_blank');
    } catch (err) {
      console.error("Failed to fetch download URL", err);
      alert("Failed to open image. It might be expired or an error occurred.");
    } finally {
      setIsDownloading(false);
    }
  };
  const getStatusIcon = (status) => {
    switch (status) {
      case 'DONE':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'PROCESSING':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default: // CREATED, QUEUED
        return <Clock className="w-5 h-5 text-amber-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'DONE':
        return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20';
      case 'PROCESSING':
        return 'bg-blue-400/10 text-blue-400 border-blue-400/20';
      case 'FAILED':
        return 'bg-red-400/10 text-red-400 border-red-400/20';
      default:
        return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
    }
  };

  return (
    <div className="glass rounded-xl p-5 hover:bg-white/[0.02] transition-colors border border-white/5 relative overflow-hidden group">
      {/* Background glow effect based on status */}
      <div className={`absolute -inset-1 opacity-20 group-hover:opacity-30 blur-2xl transition-opacity duration-500 z-0 ${
        job.status === 'DONE' ? 'bg-emerald-500' : 
        job.status === 'PROCESSING' ? 'bg-blue-500' : 'bg-transparent'
      }`} />
      
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-medium text-foreground truncate max-w-[200px] sm:max-w-[300px]" title={job.sourceUrl}>
              {job.sourceUrl.split('/').pop() || job.sourceUrl}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">ID: {job.id}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${getStatusColor(job.status)}`}>
            {getStatusIcon(job.status)}
            {job.status}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4 bg-background/30 rounded-lg p-3">
          <div>
            <p className="text-muted-foreground mb-1">Type</p>
            <p className="font-medium">{job.type}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Created At</p>
            <p className="font-medium">{new Date(job.createdAt).toLocaleString()}</p>
          </div>
        </div>

        {job.status === 'PROCESSING' && (
          <div className="w-full bg-background/50 rounded-full h-1.5 mb-2 overflow-hidden">
            <div className="bg-primary h-1.5 rounded-full w-full origin-left animate-pulse"></div>
          </div>
        )}

        {job.status === 'DONE' && job.resultUrl && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <button 
              onClick={handleViewResult}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isDownloading ? <><Loader2 className="w-4 h-4 animate-spin"/> Loading...</> : 'View Result'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
