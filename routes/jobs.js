const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const amqp = require('amqplib');

const router = express.Router();

// --- Configuration ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = 'image_tasks';
let channel = null;

// Connect to RabbitMQ asynchronously
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        console.log('Jobs Route: Connected to RabbitMQ');
    } catch (err) {
        console.error('Jobs Route: Failed to connect to RabbitMQ', err);
    }
}
connectRabbitMQ();

// POST /jobs: Accept sourceUrl and type. Create a job in the DB with status CREATED.
router.post('/', async (req, res) => {
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
    // Save job with status CREATED
    stmt.run(id, userId, status, type, sourceUrl);
    
    // Publish message to RabbitMQ queue
    if (channel) {
        const message = JSON.stringify({ jobId: id, type, sourceUrl });
        channel.sendToQueue(QUEUE_NAME, Buffer.from(message), { persistent: true });
        
        // Immediately update job status in DB to QUEUED
        db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('QUEUED', id);
    } else {
        console.error('RabbitMQ channel not ready, message not published');
    }

    // Return the job object to the user (don't wait for processing)
    const newJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
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
