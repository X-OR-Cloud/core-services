# PAG Service - Personal Agent Gateway

A NestJS microservice that handles channels, souls, conversations, messages, and memories for AI chat systems. This service provides the foundation for building AI chatbots that can connect to multiple platforms (Zalo OA, Telegram, etc.) with personalized AI agents.

## 🎯 Purpose

PAG (Personal Agent Gateway) manages the core entities and workflows for AI-powered chatbot systems:

- ✅ **Channels**: Platform connections (Zalo OA, Telegram, Facebook)
- ✅ **Souls**: AI personalities with LLM configs, prompts, and tools
- ✅ **Conversations**: Chat sessions between users and AI agents
- ✅ **Messages**: Complete message history with LLM tracking
- ✅ **Memories**: Long-term memory storage for personalized interactions

## 📁 Service Architecture

### Core Entities

```
services/pag/
├── src/
│   ├── modules/
│   │   ├── channels/          # Platform connections
│   │   ├── souls/             # AI personality configs
│   │   ├── conversations/     # Chat session management
│   │   ├── messages/          # Message history
│   │   └── memories/          # Long-term memory
│   ├── queues/
│   │   ├── producers/         # Message processors
│   │   ├── processors/        # AI workers
│   │   ├── queue.module.ts    # BullMQ configuration
│   │   └── processors.module.ts
│   ├── config/
│   │   ├── redis.config.ts    # Redis connection
│   │   └── queue.config.ts    # Queue configuration
│   └── app.module.ts
└── .env                       # Environment configuration
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or remote)
- Redis (for queue processing)

### Development

```bash
# Install dependencies (from monorepo root)
npm install

# Start MongoDB and Redis (if local)
# MongoDB: mongod
# Redis: redis-server

# Set environment variables
cp services/pag/.env.example services/pag/.env
# Edit .env with your MongoDB/Redis connection strings

# Build the service
npx nx run pag:build

# Start in development mode  
npx nx run pag:serve

# API will be available at http://localhost:3006
# Swagger docs at http://localhost:3006/api-docs
```

## 📚 API Documentation

Once running, visit `http://localhost:3006/api-docs` for interactive API documentation.

### Core Endpoints

#### Channels
- `GET /api/channels` - List platform connections
- `POST /api/channels` - Create new channel connection
- `GET /api/channels/:id` - Get channel details
- `PUT /api/channels/:id` - Update channel settings
- `DELETE /api/channels/:id` - Remove channel

#### Souls  
- `GET /api/souls` - List AI personalities
- `POST /api/souls` - Create new soul/personality
- `GET /api/souls/:id` - Get soul configuration
- `PUT /api/souls/:id` - Update soul settings

#### Conversations
- `GET /api/conversations` - List chat sessions
- `POST /api/conversations` - Start new conversation
- `GET /api/conversations/:id/messages` - Get conversation history

#### Messages
- `POST /api/messages` - Send message (triggers AI processing)
- `GET /api/messages` - Get message history with filters

#### Memories
- `GET /api/memories` - Get user memories
- `POST /api/memories` - Store memory/fact
- `PUT /api/memories/:id` - Update memory

## 🔧 Configuration

### Environment Variables

```env
# Service Configuration
PORT=3006
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/hydra-pag

# Queue System  
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# LLM APIs (for souls)
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key

# Platform APIs (for channels)
ZALO_APP_ID=your_zalo_app_id
ZALO_APP_SECRET=your_zalo_app_secret
```

## 🔀 Queue Architecture

PAG uses BullMQ for async message processing:

### Queues

1. **Inbound Queue** (`pag.inbound.queue`)
   - Processes incoming webhook messages from platforms
   - Triggers AI response generation
   - Manages conversation state

2. **Memory Queue** (`pag.memory.queue`)  
   - Extracts facts from conversations
   - Updates long-term memory storage
   - Handles memory expiration

### Flow Example

```
1. Platform webhook → Inbound Queue
2. Load soul config + conversation + memories  
3. Generate AI response via LLM
4. Send reply to platform
5. Trigger memory extraction → Memory Queue
```

## 🧩 Integration

### Platform Webhooks

Each channel automatically configures webhook endpoints:

```
POST /api/channels/:channelId/webhook
```

### Supported Platforms

- **Zalo OA**: Vietnamese messaging platform
- **Telegram**: Global messaging platform  
- **Facebook Messenger**: Meta platform (planned)

### LLM Providers

- **Gemini Flash**: Google's fast model (primary)
- **OpenAI GPT**: OpenAI models (backup)
- **Anthropic Claude**: Anthropic models (planned)

## 📊 Monitoring

- Health check: `GET /health`
- Queue monitoring: Redis insight tools
- Database monitoring: MongoDB Compass/Atlas
- Logs: Structured JSON logging

## 🚦 Status

**Current Phase**: Phase 1-3 Complete (Scaffold + Schemas + DTOs)

**Next Steps**:
- [ ] Implement service layer with BaseService inheritance
- [ ] Create modern controllers with Swagger docs
- [ ] Set up queue processors for AI workflows
- [ ] Integrate with Zalo OA API
- [ ] Add LLM integration (Gemini Flash)

**Port**: 3006 (development), 3360-3369 (production)

## 🤝 Contributing

This service follows the Hydra Services monorepo patterns:

1. Inherit from `BaseSchema` for entities
2. Extend `BaseService` for CRUD operations  
3. Use modern controller patterns (no BaseController)
4. Follow TypeScript and ESLint standards
5. Add comprehensive Swagger documentation

See `/hydra-services/CLAUDE.md` for detailed conventions.