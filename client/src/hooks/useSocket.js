import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3000';

export const useSocket = (token) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);

  useEffect(() => {
    if (!token) return;

    // Connect to WebSocket using JWT token
    const socketInstance = io(SOCKET_URL, {
      auth: { token },
      query: { token } // Fallback for some Socket.IO versions
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    });

    socketInstance.on('job_updated', (data) => {
      console.log('WebSocket message received:', data);
      setLastMessage(data);
    });

    // Reconnect logic is handled by socket.io-client automatically, 
    // but we can listen to connect_error if needed.
    socketInstance.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err.message);
      setIsConnected(false);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [token]);

  return { socket, isConnected, lastMessage };
};
