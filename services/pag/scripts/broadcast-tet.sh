#!/bin/bash
# Broadcast Tết greeting to all Zalo OA followers
# Uses "Tin Tư vấn" (cs API) — costs quota from Gói Nâng cao (2000/month)
# Usage: ./broadcast-tet.sh

set -e
WORK_DIR="/root/.openclaw/workspace/hydra-services"
CHANNEL_ID="6993fdacff96caa95baaa0f0"
LOG_FILE="/tmp/broadcast-tet-$(date +%Y%m%d-%H%M%S).log"

echo "🧧 TranGPT Tết Broadcast — $(date)" | tee "$LOG_FILE"

# 1. Get JWT + Zalo access token
cd "$WORK_DIR"
JWT=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'system',roles:['universe.owner'],orgId:'',groupId:''},'R4mD0mLyS3cR3t_',{expiresIn:'1h'}))")

ACCESS_TOKEN=$(curl -s "http://localhost:3360/channels/$CHANNEL_ID" \
  -H "Authorization: Bearer $JWT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('credentials',{}).get('accessToken',''))")

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "" ]; then
  echo "❌ Failed to get access token" | tee -a "$LOG_FILE"
  exit 1
fi
echo "✅ Access token obtained" | tee -a "$LOG_FILE"

# 2. Get all followers (paginate by 50)
USERS_FILE="/tmp/broadcast-users.txt"
> "$USERS_FILE"
OFFSET=0

while true; do
  RESP=$(curl -s -X POST "https://openapi.zalo.me/v3.0/oa/user/getlist" \
    -H "access_token: $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"offset\":$OFFSET,\"count\":50}")
  
  ERROR=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('error',0))")
  [ "$ERROR" != "0" ] && { echo "❌ API error: $RESP" | tee -a "$LOG_FILE"; break; }

  echo "$RESP" | python3 -c "import json,sys;[print(u['user_id']) for u in json.load(sys.stdin)['data']['users']]" >> "$USERS_FILE"
  
  BATCH=$(echo "$RESP" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['data']['users']))")
  OFFSET=$((OFFSET + 50))
  [ "$BATCH" -lt 50 ] && break
  sleep 0.5
done

TOTAL=$(wc -l < "$USERS_FILE")
echo "📊 Total followers to broadcast: $TOTAL" | tee -a "$LOG_FILE"

# 3. Send message to each follower
MESSAGE="Chào anh/chị! 🎉🐎

Nhân dịp Tết Bính Ngọ 2026, TranGPT xin kính chúc anh/chị một năm mới thật nhiều sức khỏe, thành công và hạnh phúc!

Em là TranGPT, trợ lý AI cá nhân của anh/chị trên Zalo. Em có thể giúp anh/chị:

1. Trả lời mọi câu hỏi, từ đời sống đến công việc
2. Ghi nhớ thông tin anh/chị chia sẻ để phục vụ tốt hơn
3. Gợi ý địa điểm, ẩm thực, du lịch phù hợp
4. Chat vui, tâm sự hay tư vấn bất cứ lúc nào

Anh/chị cứ nhắn tin cho em bất cứ khi nào cần nhé! Em luôn sẵn sàng 😊

Chúc anh/chị năm Ngọ vạn sự như ý! 🧧"

# Escape for JSON
MSG_JSON=$(python3 -c "import json; print(json.dumps('$MESSAGE'.replace(\"'\", \"\\'\")))" 2>/dev/null || echo "")
# Better approach: use python for sending
python3 - "$ACCESS_TOKEN" "$USERS_FILE" "$LOG_FILE" "$MESSAGE" << 'PYEOF'
import sys, json, time, urllib.request

access_token = sys.argv[1]
users_file = sys.argv[2]
log_file = sys.argv[3]
message = """Chào anh/chị! 🎉🐎

Nhân dịp Tết Bính Ngọ 2026, TranGPT xin kính chúc anh/chị một năm mới thật nhiều sức khỏe, thành công và hạnh phúc!

Em là TranGPT, trợ lý AI cá nhân của anh/chị trên Zalo. Em có thể giúp anh/chị:

1. Trả lời mọi câu hỏi, từ đời sống đến công việc
2. Ghi nhớ thông tin anh/chị chia sẻ để phục vụ tốt hơn
3. Gợi ý địa điểm, ẩm thực, du lịch phù hợp
4. Chat vui, tâm sự hay tư vấn bất cứ lúc nào

Anh/chị cứ nhắn tin cho em bất cứ khi nào cần nhé! Em luôn sẵn sàng 😊

Chúc anh/chị năm Ngọ vạn sự như ý! 🧧"""

with open(users_file) as f:
    users = [line.strip() for line in f if line.strip()]

sent = 0
failed = 0
errors = []

for uid in users:
    payload = json.dumps({
        "recipient": {"user_id": uid},
        "message": {"text": message}
    }).encode()
    
    req = urllib.request.Request(
        "https://openapi.zalo.me/v3.0/oa/message/cs",
        data=payload,
        headers={"access_token": access_token, "Content-Type": "application/json"}
    )
    
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        if data.get("error") == 0:
            sent += 1
        else:
            failed += 1
            errors.append(f"{uid}: error {data.get('error')} - {data.get('message')}")
    except Exception as e:
        failed += 1
        errors.append(f"{uid}: {str(e)}")
    
    time.sleep(0.15)  # rate limit

print(f"\n✅ Broadcast complete!")
print(f"📊 Sent: {sent}/{len(users)}, Failed: {failed}")

with open(log_file, "a") as f:
    f.write(f"\nSent: {sent}, Failed: {failed}\n")
    for e in errors:
        f.write(f"ERROR: {e}\n")
    
if errors:
    print(f"⚠️ Errors logged to {log_file}")
    for e in errors[:5]:
        print(f"  {e}")
PYEOF

echo "📋 Full log: $LOG_FILE"
