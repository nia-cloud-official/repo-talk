export function sanitizeMessage(message) {
  if (!message || typeof message !== 'string') {
    return '';
  }

  // Remove any HTML tags and dangerous characters
  return message
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .substring(0, 5000); // Limit message length
}

export function sanitizeUsername(username) {
  if (!username || typeof username !== 'string') {
    return '';
  }

  return username.replace(/[<>]/g, '').trim().substring(0, 50);
}

export function sanitizeRoomId(roomId) {
  // Room ID format: owner/repo or owner/repo#pr-123 or owner/repo#issue-45
  if (!roomId || typeof roomId !== 'string') {
    return '';
  }

  return roomId.replace(/[<>]/g, '').trim();
}

export function sanitizeGroupName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name.replace(/[<>]/g, '').trim().substring(0, 100);
}
