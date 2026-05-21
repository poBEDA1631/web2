const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const amqp = require('amqplib');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const router = express.Router();

const ERRORS = {
    MISSING_FIELDS: 'sourceUrl and type are required',
    INVALID_URL: 'Invalid sourceUrl format',
    FETCH_FAILED: 'Failed to fetch jobs',
    NOT_FOUND_OR_DENIED: 'Job not found or access denied',
    GET_FAILED: 'Failed to fetch job',
    NOT_COMPLETED: 'Job is not completed yet',
    DOWNLOAD_FAILED: 'Failed to generate download URL',
    CREATE_FAILED: 'Failed to create job'
};

// --- MinIO / S3 Configuration ---
const s3Client = new S3Client({
    endpoint: 'http://127.0.0.1:9000',
    region: 'us-east-1',
    credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin'
    },
    forcePathStyle: true // Required for MinIO
});

// --- Configuration ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://127.0.0.1';
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
    return res.status(400).json({ error: ERRORS.MISSING_FIELDS });
  }

  try {
    new URL(sourceUrl);
  } catch (err) {
    return res.status(400).json({ error: ERRORS.INVALID_URL });
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
    res.status(500).json({ error: ERRORS.CREATE_FAILED });
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
    res.status(500).json({ error: ERRORS.FETCH_FAILED });
  }
});

// GET /jobs/:id: Return a specific job
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND userId = ?').get(id, userId);
    
    if (!job) {
      return res.status(404).json({ error: ERRORS.NOT_FOUND_OR_DENIED });
    }
    
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: ERRORS.GET_FAILED });
  }
});

// GET /jobs/:id/download: Generate presigned URL for MinIO
router.get('/:id/download', async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND userId = ?').get(id, userId);
    
    if (!job) {
      return res.status(404).json({ error: ERRORS.NOT_FOUND_OR_DENIED });
    }

    if (job.status !== 'DONE' || !job.resultUrl) {
      return res.status(400).json({ error: ERRORS.NOT_COMPLETED });
    }

    const s3Key = job.resultUrl;
    const command = new GetObjectCommand({
      Bucket: 'images',
      Key: s3Key
    });

    // URL expires in 1 hour (3600 seconds)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    res.json({ downloadUrl: signedUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: ERRORS.DOWNLOAD_FAILED });
  }
});

module.exports = router;
module.exports.ERRORS = ERRORS;
