const VALID_TRANSITIONS = {
  CREATED: ['QUEUED', 'FAILED'],
  QUEUED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['DONE', 'FAILED'],
  DONE: [],
  FAILED: []
};

function isValidTransition(currentStatus, newStatus) {
  if (!currentStatus || !newStatus) return false;
  
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) return false;

  return allowed.includes(newStatus);
}

module.exports = {
  isValidTransition,
  VALID_TRANSITIONS
};
