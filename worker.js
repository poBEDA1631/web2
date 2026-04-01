const amqp = require('amqplib');
const db = require('./database');

// --- Configuration ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = 'image_tasks';

async function startWorker() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        
        // Assert the queue exists and is durable
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        
        // Process one message at a time
        channel.prefetch(1);
        
        console.log(`[*] Worker started. Waiting for messages in queue: ${QUEUE_NAME}...`);
        
        channel.consume(QUEUE_NAME, async (msg) => {
            if (msg !== null) {
                const messageContent = msg.content.toString();
                let task;
                
                try {
                    task = JSON.parse(messageContent);
                } catch (e) {
                    console.error('[!] Failed to parse message JSON. Acknowledging and discarding msg:', messageContent);
                    channel.ack(msg);
                    return;
                }
                
                console.log(`\n[x] Received task for Job ID: ${task.jobId}`);
                
                // Idempotency Logic: Checks before processing
                const job = db.prepare('SELECT status FROM jobs WHERE id = ?').get(task.jobId);
                
                if (!job) {
                    console.log(`[!] Job ${task.jobId} not found in DB. Skipping.`);
                    channel.ack(msg);
                    return;
                }

                if (job.status === 'DONE' || job.status === 'PROCESSING') {
                    console.log(`[-] Job ${task.jobId} is already ${job.status}. Acknowledging and skipping.`);
                    channel.ack(msg);
                    return;
                }

                console.log(`[.] 1. Updating status to PROCESSING in SQLite...`);
                try {
                    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('PROCESSING', task.jobId);
                } catch (err) {
                    console.error(`[!] DB Error updating to PROCESSING:`, err);
                    // Do not acknowledge so message can be retried eventually
                    return;
                }

                console.log(`[.] 2. Simulating heavy async work (7-second delay)...`);
                await new Promise(resolve => setTimeout(resolve, 7000));
                
                console.log(`[.] 3. Heavy work complete. Updating status to DONE in SQLite...`);
                try {
                    const resultUrl = `https://storage.example.com/result_${task.jobId}.jpg`;
                    db.prepare('UPDATE jobs SET status = ?, resultUrl = ? WHERE id = ?').run('DONE', resultUrl, task.jobId);
                    
                    console.log(`[v] 4. DB update successful. Acknowledging message.`);
                    channel.ack(msg);
                    
                } catch (err) {
                    console.error(`[!] DB Error updating to DONE:`, err);
                    // Do not acknowledge if DB update fails to ensure no data loss
                }
            }
        }, { noAck: false });
        
    } catch (err) {
        console.error('[!] Worker failed to connect or start:', err);
    }
}

startWorker();
