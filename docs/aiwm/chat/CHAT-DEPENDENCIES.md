# Chat Module Dependencies

The Chat WebSocket module requires the following npm packages to be installed:

## Required Packages

```bash
# Socket.IO and adapters
npm install socket.io @socket.io/redis-adapter

# Redis clients
npm install redis ioredis @nestjs-modules/ioredis

# NestJS WebSocket support
npm install @nestjs/websockets @nestjs/platform-socket.io

# JWT for WebSocket authentication (may already be installed)
npm install @nestjs/jwt
```

## Installation Command

Run this command in the project root:

```bash
npm install socket.io @socket.io/redis-adapter redis ioredis @nestjs-modules/ioredis @nestjs/websockets @nestjs/platform-socket.io
```

## Environment Variables

Add these to your `.env` file:

```env
# Redis configuration
REDIS_URL=redis://localhost:6379

# JWT secret (if not already set)
JWT_SECRET=your-secret-key-here
```

## Verification

After installation, rebuild the project:

```bash
npx nx build aiwm
```

## Redis Setup

Make sure Redis is running:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or using Homebrew (macOS)
brew services start redis
```

## Testing WebSocket Connection

Use a WebSocket client to test the connection:

```javascript
// Example client code
const socket = io('http://localhost:3003/chat', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connect', () => {
  console.log('Connected to chat server');

  // Join a conversation
  socket.emit('conversation:join', { conversationId: 'conv-123' });

  // Send a message
  socket.emit('message:send', {
    conversationId: 'conv-123',
    role: 'user',
    content: 'Hello from WebSocket!'
  });
});

socket.on('message:new', (message) => {
  console.log('New message:', message);
});
```
