const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const authRoutes = require('./routes/auth');
const jobsRoutes = require('./routes/jobs');
const { verifyToken, JWT_SECRET } = require('./middleware/auth');
const db = require('./database');
const amqp = require('amqplib');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
// Налаштовуємо Socket.io з дозволом доступу з будь-яких адрес (CORS *)
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

// --- WEBSOCKETS ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) return next(new Error('Authentication error: Token missing'));

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error: Invalid token'));
        socket.userId = decoded.userId;
        next();
    });
});

io.on('connection', (socket) => {
    console.log(`[WebSocket] User connected: ${socket.userId}`);
    socket.join(socket.userId);

    socket.on('disconnect', () => {
        console.log(`[WebSocket] User disconnected: ${socket.userId}`);
    });
});

// Make io available to routes if needed
app.set('io', io);

// --- RABBITMQ INTEGRATION ---
async function setupRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://127.0.0.1');
        const channel = await connection.createChannel();

        // Ensure queues exist
        await channel.assertQueue('image_tasks', { durable: true });
        await channel.assertQueue('job_updates', { durable: true });

        // Make channel available to routes
        app.set('amqpChannel', channel);

        // Listen for updates from Python worker
        channel.consume('job_updates', (msg) => {
            if (msg !== null) {
                try {
                    const update = JSON.parse(msg.content.toString());
                    console.log(`[RabbitMQ] Received update:`, update);

                    const { jobId, status, resultUrl } = update;
                    if (jobId && status) {
                        db.prepare('UPDATE jobs SET status = ?, resultUrl = ? WHERE id = ?')
                            .run(status, resultUrl || null, jobId);

                        const jobRow = db.prepare('SELECT userId FROM jobs WHERE id = ?').get(jobId);
                        if (jobRow && jobRow.userId) {
                            io.to(jobRow.userId).emit('job_updated', {
                                jobId,
                                status,
                                resultUrl
                            });
                        }
                    }
                    channel.ack(msg);
                } catch (e) {
                    console.error('Error processing update from job_updates:', e.message);
                    channel.nack(msg, false, false);
                }
            }
        });

        console.log('✅ Connected to RabbitMQ and listening on job_updates queue');
    } catch (error) {
        console.error('❌ Failed to connect to RabbitMQ:', error.message);
    }
}
setupRabbitMQ();

// Middleware to parse JSON request bodies
app.use(express.json());

// --- ROUTES ---

app.get('/', (req, res) => {
    res.send('<h1>Ласкаво просимо до AI Image Processor API!</h1><p>Сервер працює успішно.</p>');
});

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
// Start the server only if run directly
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`AI Image Processor server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
