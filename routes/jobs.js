const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');

const router = express.Router();

// POST /jobs: Accept sourceUrl and type. Create a job in the DB with status CREATED.
router.post('/', (req, res) => {
  const { sourceUrl, type } = req.body;
  
  if (!sourceUrl || !type) {
    return res.status(400).json({ error: 'sourceUrl and type are required' });
  }

  const id = uuidv4();
  const userId = req.userId; // Provided by auth middleware
  const status = 'CREATED';

  const stmt = db.prepare(`
    INSERT INTO jobs (id, userId, status, type, sourceUrl) 
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(id, userId, status, type, sourceUrl);
    // Fetch the inserted job to return
    const newJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    
    // Start job simulation in the background
    const simulator = req.app.get('simulator');
    if (simulator) {
        simulator(id);
    }
    
    res.status(201).json(newJob);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /jobs: Return all jobs for the authenticated user
router.get('/', (req, res) => {
  const userId = req.userId;
  
  try {
    const jobs = db.prepare('SELECT * FROM jobs WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /jobs/:id: Return a specific job
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND userId = ?').get(id, userId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

module.exports = router;
