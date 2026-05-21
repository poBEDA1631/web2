const { z } = require('zod');

/**
 * Strict schema for RabbitMQ job message contracts.
 * Rejects unexpected properties, enforcing strict contract validation.
 * Uses z.string() instead of z.string().uuid() to remain compatible with
 * deterministic fixture IDs (e.g. 'job-get-single-1').
 * Adheres strictly to Section 9.3 of the Test Strategy.
 */
const JobMessageSchema = z.object({
    jobId:     z.string(),
    type:      z.enum(['blur', 'grayscale', 'resize']),
    sourceUrl: z.string().url(),
}).strict();

module.exports = { JobMessageSchema };
