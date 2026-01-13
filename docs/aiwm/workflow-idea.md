TÀI LIỆU THIẾT KẾ MVP

Workflow Engine cho LLM & Quản lý Data Input (Phase 1)

⸻

1. Mục tiêu & Phạm vi

Tài liệu này mô tả thiết kế phiên bản MVP cho các service mới, tập trung vào:
	•	Workflow Engine tổng quát cho các use case LLM
	•	Quản lý dữ liệu đầu vào ở mức tối thiểu để phục vụ workflow

Mục tiêu của MVP:
	•	Minh họa rõ ý tưởng sản phẩm (LLM workflow pipeline)
	•	Dễ demo với dashboard/portal hiện có
	•	Không khóa chặt vào 1 framework (LangChain/LangGraph)

⸻

2. Tổng quan kiến trúc (Phase 1)

[ IAM Service ]
      │ (JWT, orgId, userId)
      ▼
[ Workflow Service ]  <───>  [ Data Input Service ]
      │
      ▼
[ LLM Provider APIs ]

	•	IAM: đã có sẵn (Org, User)
	•	Workflow Service: quản lý workflow, step, run, log
	•	Data Input Service: quản lý & liệt kê dữ liệu đầu vào

⸻

3. ERM – Thiết kế dữ liệu

3.1 Workflow

Mục đích: Định nghĩa một quy trình xử lý logic (không chứa trạng thái runtime)

Field	Type	Mô tả
id	uuid	ID workflow
name	string	Tên workflow
description	text	Mô tả nghiệp vụ
version	string	Phiên bản
executionMode	enum	internal / langgraph
status	enum	draft / active / archived
createdAt	timestamp	Thời điểm tạo

Sample data

{
  "id": "wf_001",
  "name": "Gold Trading Analysis",
  "version": "v1",
  "executionMode": "internal",
  "status": "active"
}


⸻

3.2 WorkflowStep

Mục đích: Định nghĩa từng bước xử lý trong workflow

Field	Type	Mô tả
id	uuid	ID step
workflowId	uuid	Thuộc workflow nào
orderIndex	int	Thứ tự chạy
type	enum	llm / rule / transform
name	string	Tên step
llmModel	string	Model sử dụng (nếu type=llm)
systemPrompt	text	System prompt
parameters	json	Tham số LLM
inputSchema	json	JSON schema input
outputSchema	json	JSON schema output

Sample data

{
  "id": "step_01",
  "workflowId": "wf_001",
  "orderIndex": 1,
  "type": "llm",
  "name": "Analyze market trend",
  "llmModel": "gpt-4.1",
  "systemPrompt": "You are a gold trading analyst"
}


⸻

3.3 WorkflowRun

Mục đích: Đại diện cho một lần thực thi workflow

Field	Type	Mô tả
id	uuid	ID run
workflowId	uuid	Workflow được chạy
triggerType	enum	manual / api / system
context	json	orgId, userId, product
input	json	Dữ liệu đầu vào ban đầu
status	enum	pending / running / success / failed
startedAt	timestamp	Bắt đầu
finishedAt	timestamp	Kết thúc

Sample data

{
  "id": "wr_001",
  "workflowId": "wf_001",
  "triggerType": "manual",
  "status": "running"
}


⸻

3.4 WorkflowStepRun

Mục đích: Log runtime của từng step

Field	Type	Mô tả
id	uuid	ID step run
workflowRunId	uuid	Thuộc workflow run
workflowStepId	uuid	Step tương ứng
input	json	Input thực tế
output	json	Output thực tế
status	enum	running / success / failed
error	text	Lỗi nếu có
startedAt	timestamp	Bắt đầu
finishedAt	timestamp	Kết thúc

Sample data

{
  "id": "wsr_001",
  "workflowRunId": "wr_001",
  "workflowStepId": "step_01",
  "status": "success"
}


⸻

3.5 DataSource (Data Input – tối thiểu)

Mục đích: Khai báo nguồn dữ liệu đầu vào

Field	Type	Mô tả
id	uuid	ID datasource
name	string	Tên nguồn dữ liệu
type	enum	api / file / manual
serviceRef	string	URL / service name
schema	json	Schema dữ liệu
tags	array	Phân loại


⸻

3.6 DataAsset

Mục đích: Đại diện cho dataset mà end-user chọn

Field	Type	Mô tả
id	uuid	ID asset
dataSourceId	uuid	Thuộc datasource
name	string	Tên dataset
description	text	Mô tả
metadata	json	Thông tin bổ sung


⸻

4. Luồng xử lý & trạng thái

4.1 WorkflowRun state

pending → running → success
                  → failed

	•	pending: vừa được trigger
	•	running: đang chạy ít nhất 1 step
	•	success: tất cả step thành công
	•	failed: một step failed

⸻

4.2 WorkflowStepRun state

running → success
        → failed


⸻

4.3 Luồng thực thi tổng thể
	1.	API trigger workflow
	2.	Tạo WorkflowRun (status=running)
	3.	Resolve input (Data Input Service)
	4.	Lặp qua WorkflowStep theo orderIndex
	5.	Với mỗi step:
	•	Tạo WorkflowStepRun
	•	Thực thi (LLM / rule)
	•	Lưu input/output
	6.	Cập nhật trạng thái WorkflowRun

⸻

5. API Endpoint sơ bộ

5.1 Workflow

GET  /workflows
POST /workflows
GET  /workflows/{id}
PUT  /workflows/{id}


⸻

5.2 WorkflowStep

GET  /workflows/{id}/steps
POST /workflows/{id}/steps
PUT  /workflow-steps/{id}


⸻

5.3 Trigger Workflow

POST /workflows/{id}/runs

Request

{
  "input": {
    "assetId": "gold_price_daily"
  },
  "context": {
    "orgId": "org_001",
    "userId": "user_001"
  }
}


⸻

5.4 WorkflowRun & Logs

GET /workflow-runs
GET /workflow-runs/{id}
GET /workflow-runs/{id}/steps


⸻

5.5 Data Input

GET /data-sources
GET /data-assets
GET /data-assets/{id}


⸻

6. Ghi chú cho Phase 2
	•	Thêm Artifact entity
	•	Thêm branching / condition step
	•	Scheduler & webhook trigger
	•	LangGraph execution mode

⸻

Kết luận: Thiết kế này đủ nhẹ để làm MVP, đủ chuẩn để mở rộng thành platform workflow LLM đa sản phẩm.
