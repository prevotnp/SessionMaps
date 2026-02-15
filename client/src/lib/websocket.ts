import { debounce } from '@/lib/utils';

interface WebSocketConnection {
  socket: WebSocket;
  disconnect: () => void;
}

// Singleton websocket instance
let websocket: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;
let userId: number | null = null;

// Create a websocket connection
export function setupWebsocket(currentUserId: number): WebSocketConnection {
  // Store the user ID for reconnection
  userId = currentUserId;
  
  // If a connection is already being established, wait for it
  if (isConnecting) {
    return {
      socket: websocket || createWebSocket(currentUserId),
      disconnect: () => disconnectWebsocket()
    };
  }
  
  // If a connection already exists and is open, return it
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    return {
      socket: websocket,
      disconnect: () => disconnectWebsocket()
    };
  }
  
  // If a connection exists but is closing or closed, create a new one
  if (websocket && (websocket.readyState === WebSocket.CLOSING || websocket.readyState === WebSocket.CLOSED)) {
    disconnectWebsocket();
  }
  
  // Create a new connection
  return {
    socket: createWebSocket(currentUserId),
    disconnect: () => disconnectWebsocket()
  };
}

// Create a new websocket connection
function createWebSocket(currentUserId: number): WebSocket {
  isConnecting = true;
  
  // Determine the WebSocket URL based on the current protocol and host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  console.log(`Connecting to WebSocket at ${wsUrl}`);
  
  // Create a new WebSocket connection
  websocket = new WebSocket(wsUrl);
  
  // Set up event handlers
  websocket.onopen = () => {
    console.log('WebSocket connection established');
    isConnecting = false;
    
    // Send authentication message
    websocket.send(JSON.stringify({
      type: 'auth',
      userId: currentUserId
    }));
    
    // Set up ping interval to keep connection alive
    pingInterval = setInterval(() => {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Send ping every 30 seconds
    
    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };
  
  websocket.onclose = (event) => {
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    isConnecting = false;
    
    // Clear ping interval
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    
    // Attempt to reconnect after a delay
    if (!reconnectTimeout && userId) {
      reconnectTimeout = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        createWebSocket(userId);
        reconnectTimeout = null;
      }, 5000); // Try to reconnect after 5 seconds
    }
  };
  
  websocket.onerror = (error) => {
    console.error('WebSocket error:', error);
    isConnecting = false;
  };
  
  return websocket;
}

// Disconnect the websocket
function disconnectWebsocket(): void {
  console.log('Disconnecting WebSocket');
  
  // Clear intervals and timeouts
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  // Close the connection if it exists
  if (websocket) {
    if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
      websocket.close();
    }
    websocket = null;
  }
  
  userId = null;
  isConnecting = false;
}

// Send location update to the server
export const sendLocationUpdate = debounce((location: {
  latitude: number;
  longitude: number;
  altitude?: number | null;
}) => {
  if (!websocket || websocket.readyState !== WebSocket.OPEN || !userId) {
    console.warn('Cannot send location: WebSocket not connected');
    return;
  }
  
  websocket.send(JSON.stringify({
    type: 'location',
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude
    }
  }));
}, 500); // Debounce to avoid sending too many updates

// Listen for shared locations from other users
export function listenForSharedLocations(callback: (data: any) => void): () => void {
  const messageHandler = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'location') {
        callback(data);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };
  
  if (websocket) {
    websocket.addEventListener('message', messageHandler);
  }
  
  // Return a cleanup function
  return () => {
    if (websocket) {
      websocket.removeEventListener('message', messageHandler);
    }
  };
}
