# Redis Commands để Check BullMQ Queue

## Kết nối Redis
```bash
redis-cli -h 172.16.2.100 -p 6379
```

## Các lệnh kiểm tra queue

### 1. Liệt kê tất cả keys của queue
```redis
KEYS bull:workflow-executions:*
```

### 2. Đếm số jobs đang chờ (waiting)
```redis
LLEN bull:workflow-executions:wait
```

### 3. Xem danh sách job IDs đang chờ (5 jobs đầu)
```redis
LRANGE bull:workflow-executions:wait 0 4
```

### 4. Đếm số jobs đang active
```redis
LLEN bull:workflow-executions:active
```

### 5. Xem chi tiết job cụ thể (thay <job-id> bằng ID thực tế)
```redis
HGETALL bull:workflow-executions:<job-id>
```
Ví dụ:
```redis
HGETALL bull:workflow-executions:workflow-exec-69676a6a657fc39c8644d141
```

### 6. Đếm jobs completed
```redis
ZCARD bull:workflow-executions:completed
```

### 7. Đếm jobs failed
```redis
ZCARD bull:workflow-executions:failed
```

### 8. Xem workers đang kết nối
```redis
SMEMBERS bull:workflow-executions:workers
```

### 9. Xem meta info của queue
```redis
HGETALL bull:workflow-executions:meta
```

### 10. Xóa tất cả jobs (nếu cần reset)
```redis
DEL bull:workflow-executions:wait
DEL bull:workflow-executions:active
DEL bull:workflow-executions:completed
DEL bull:workflow-executions:failed
```

## Quy trình debug

1. **Check xem job có được thêm vào queue không:**
   ```redis
   LLEN bull:workflow-executions:wait
   ```
   - Nếu > 0: Job đã được API thêm vào queue thành công
   - Nếu = 0: API chưa thêm job vào queue

2. **Xem chi tiết job đầu tiên:**
   ```redis
   LINDEX bull:workflow-executions:wait 0
   ```
   Lấy job ID, rồi xem chi tiết:
   ```redis
   HGETALL bull:workflow-executions:<job-id>
   ```

3. **Check worker có kết nối không:**
   ```redis
   SMEMBERS bull:workflow-executions:workers
   ```
   - Nếu có workers: Worker đã kết nối đến queue
   - Nếu rỗng: Worker chưa kết nối hoặc chưa khởi động đúng

## Expected Results

**Khi API thêm job:**
- `LLEN bull:workflow-executions:wait` trả về > 0
- Log API: `[WorkflowExecutionQueue] Added execution job for <id>`

**Khi Worker nhận job:**
- `LLEN bull:workflow-executions:wait` giảm xuống
- `LLEN bull:workflow-executions:active` tăng lên
- Log Worker: `🔄 Worker picked up job <job-id>`

**Khi job hoàn thành:**
- `LLEN bull:workflow-executions:active` giảm xuống
- `ZCARD bull:workflow-executions:completed` tăng lên
- Log Worker: `✅ Job <job-id> completed successfully`
