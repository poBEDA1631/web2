const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
    endpoint: 'http://127.0.0.1:9000',
    region: 'us-east-1',
    credentials: {
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin'
    },
    forcePathStyle: true
});

async function test() {
    console.log("Starting...");
    const command = new GetObjectCommand({
        Bucket: 'images',
        Key: 'test.jpg'
    });
    console.log("Command created...");
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    console.log("Signed URL:", signedUrl);
}

test().catch(console.error);
