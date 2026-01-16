#!/bin/bash

# Script to check BullMQ queue status in Redis
# Usage: ./check-redis-queue.sh

REDIS_HOST="172.16.2.100"
REDIS_PORT="6379"
QUEUE_NAME="workflow-executions"

echo "=========================================="
echo "BullMQ Queue Inspector"
echo "=========================================="
echo "Queue: $QUEUE_NAME"
echo "Redis: $REDIS_HOST:$REDIS_PORT"
echo ""

# Check if redis-cli is available
if ! command -v redis-cli &> /dev/null; then
    echo "ERROR: redis-cli not found. Please install redis-cli first."
    exit 1
fi

echo "1. All Keys Related to Queue:"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT KEYS "bull:$QUEUE_NAME:*"
echo ""

echo "2. Waiting Jobs Count:"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT LLEN "bull:$QUEUE_NAME:wait"
echo ""

echo "3. Active Jobs Count:"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT LLEN "bull:$QUEUE_NAME:active"
echo ""

echo "4. Completed Jobs Count:"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT ZCARD "bull:$QUEUE_NAME:completed"
echo ""

echo "5. Failed Jobs Count:"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT ZCARD "bull:$QUEUE_NAME:failed"
echo ""

echo "6. Delayed Jobs Count:"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT ZCARD "bull:$QUEUE_NAME:delayed"
echo ""

echo "7. List Waiting Jobs (first 5):"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT LRANGE "bull:$QUEUE_NAME:wait" 0 4
echo ""

echo "8. Get First Job Details:"
echo "----------------------------------------"
FIRST_JOB_ID=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT LINDEX "bull:$QUEUE_NAME:wait" 0)
if [ ! -z "$FIRST_JOB_ID" ]; then
    echo "Job ID: $FIRST_JOB_ID"
    redis-cli -h $REDIS_HOST -p $REDIS_PORT HGETALL "bull:$QUEUE_NAME:$FIRST_JOB_ID"
else
    echo "No waiting jobs"
fi
echo ""

echo "9. Queue Meta Info:"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT HGETALL "bull:$QUEUE_NAME:meta"
echo ""

echo "10. Active Workers (if any):"
echo "----------------------------------------"
redis-cli -h $REDIS_HOST -p $REDIS_PORT SMEMBERS "bull:$QUEUE_NAME:workers"
echo ""

echo "=========================================="
echo "Done!"
echo "=========================================="
