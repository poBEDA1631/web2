const express = require('express');
const authRoutes = require('./routes/auth');
const jobsRoutes = require('./routes/jobs');
const { verifyToken } = require('./middleware/auth');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// --- JOB LIFECYCLE SIMULATION ---
// Helper function to simulate processing delay
const randomDelay = () => Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds

const simulateJobLifecycle = (jobId) => {
    // Stage 1: CREATED -> QUEUED
    setTimeout(() => {
        try {
            db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('QUEUED', jobId);
            console.log(`[Job ${jobId}] Status: QUEUED`);

            // Stage 2: QUEUED -> PROCESSING
            setTimeout(() => {
                try {
                    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('PROCESSING', jobId);
                    console.log(`[Job ${jobId}] Status: PROCESSING`);
        
                    // Stage 3: PROCESSING -> DONE/ERROR
                    setTimeout(() => {
                        try {
                            const isSuccess = Math.random() > 0.1; // 90% success rate
                            const finalStatus = isSuccess ? 'DONE' : 'ERROR';
                            const resultUrl = isSuccess ? `https://storage.example.com/result_${jobId}.jpg` : null;
                            
                            db.prepare('UPDATE jobs SET status = ?, resultUrl = ? WHERE id = ?').run(finalStatus, resultUrl, jobId);
                            console.log(`[Job ${jobId}] Status: ${finalStatus}`);
                        } catch (e) {
                            console.error(`Error finishing job ${jobId}:`, e.message);
                        }
                    }, randomDelay());
                } catch (e) {
                    console.error(`Error processing job ${jobId}:`, e.message);
                }
            }, randomDelay());
        } catch (e) {
            console.error(`Error queuing job ${jobId}:`, e.message);
        }
    }, randomDelay());
};

// Make simulator available to routes
app.set('simulator', simulateJobLifecycle);

// Middleware to parse JSON request bodies
app.use(express.json());

// --- ROUTES ---

// Lab 2: Authentication routing
app.use('/auth', authRoutes);

// Lab 1 & 2: Jobs routing (protected by verifyToken middleware)
app.use('/jobs', verifyToken, jobsRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong on the server!' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`AI Image Processor server is running on http://localhost:${PORT}`);
});
