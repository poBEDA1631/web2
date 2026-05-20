const Database = require('better-sqlite3');
const path = require('path');

let db;
if (process.env.NODE_ENV === 'test') {
  db = new Database(':memory:');
} else {
  const dbPath = path.join(__dirname, 'database.sqlite');
  db = new Database(dbPath);
}

// Create the jobs table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    status TEXT NOT NULL,
    type TEXT NOT NULL,
    sourceUrl TEXT NOT NULL,
    resultUrl TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
