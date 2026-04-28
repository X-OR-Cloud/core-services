# K8s Manifests — MB Bank Deployment

Bộ manifest Kubernetes để triển khai toàn bộ hệ thống Hydra Services vào môi trường air-gap.

## Cấu trúc

```
k8s/mb-bank/
├── 00-namespace.yaml          # Namespace hydra-prod
├── 01-secrets.yaml            # Secrets (DB, JWT, License) — điền trước khi apply
├── 02-configmap.yaml          # ConfigMap cấu hình chung
├── 03-storage/
│   └── pv-pvc.yaml            # PersistentVolumes (NFS) + PVCs
├── infra/
│   ├── 01-mongodb.yaml        # MongoDB 8.0 StatefulSet
│   ├── 02-redis.yaml          # Redis 7.4 StatefulSet
│   ├── 03-qdrant.yaml         # Qdrant v1.14.0 StatefulSet
│   └── 04-seaweedfs.yaml      # SeaweedFS 4.20 (Master + Volume + S3 Filer)
├── services/
│   ├── 01-iam.yaml            # IAM (port 3310)
│   ├── 02-aiwm.yaml           # AIWM — 8 modes (3330/3355/3400/3403/3407)
│   ├── 03-cbm.yaml            # CBM — 3 modes (3340/4014)
│   └── 04-mona.yaml           # MONA (port 3350)
└── 05-nginx-ingress.yaml      # Nginx gateway — NodePort 30080
```

## Thứ tự apply

```bash
NAMESPACE=hydra-prod

# 1. Tạo namespace
kubectl apply -f 00-namespace.yaml

# 2. Tạo license Secret từ file thực (quan trọng — làm trước secrets.yaml)
kubectl create secret generic hydra-license \
  --from-file=.license=mb-bank.license \
  -n $NAMESPACE

# 3. Điền giá trị thực vào 01-secrets.yaml rồi apply
#    (Thay tất cả placeholder <...> bằng giá trị thực)
kubectl apply -f 01-secrets.yaml
kubectl apply -f 02-configmap.yaml

# 4. Storage — thay <NFS_SERVER_IP> trong pv-pvc.yaml trước khi apply
#    Tạo thư mục NFS trước: mkdir -p /home-dev/hydra-prod/{mongodb,redis,qdrant,seaweedfs,cbm}
kubectl apply -f storage/pv-pvc.yaml

# 5. Infrastructure (thứ tự quan trọng)
kubectl apply -f infra/01-mongodb.yaml
kubectl apply -f infra/02-redis.yaml
kubectl apply -f infra/03-qdrant.yaml
kubectl apply -f infra/04-seaweedfs.yaml

# Chờ infra sẵn sàng
kubectl wait --for=condition=ready pod -l app=mongodb -n $NAMESPACE --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis -n $NAMESPACE --timeout=60s
kubectl wait --for=condition=ready pod -l app=qdrant -n $NAMESPACE --timeout=60s

# 6. Services
kubectl apply -f services/01-iam.yaml
kubectl apply -f services/02-aiwm.yaml
kubectl apply -f services/03-cbm.yaml
kubectl apply -f services/04-mona.yaml

# 7. Gateway
kubectl apply -f 05-nginx-ingress.yaml
```

## Kiểm tra sau deploy

```bash
# Tất cả pods phải Running
kubectl get pods -n hydra-prod

# Health check từng service
kubectl port-forward svc/iam-service 3310:3310 -n hydra-prod &
curl http://localhost:3310/health
# Expected: {"status":"ok","license":{"expiresAt":"2026-07-31","expired":false}}

# Xem logs nếu pod crash
kubectl logs -f deployment/iam -n hydra-prod
```

## Checklist trước khi apply

- [ ] Load tất cả Docker images vào containerd trên các worker nodes
- [ ] Thay `<NFS_SERVER_IP>` trong `storage/pv-pvc.yaml`
- [ ] Tạo thư mục NFS: `/home-dev/hydra-prod/{mongodb,redis,qdrant,seaweedfs/master,seaweedfs/volume,cbm/knowledge}`
- [ ] Điền secrets thực vào `01-secrets.yaml`
- [ ] Tạo hydra-license Secret từ file `mb-bank.license`
- [ ] Cập nhật `FE_BASE_URL` và `GOOGLE_REDIRECT_URI` trong `02-configmap.yaml`
- [ ] Cập nhật `KB_EMBEDDING_API_URL` trỏ về vLLM service nội bộ

## Ghi chú

- **License hết hạn:** 2026-07-31 — liên hệ Hydra Byte trước 30 ngày
- **imagePullPolicy: Never** — tất cả images phải được load trước vào containerd
- **NFS paths** — tất cả persistent data lưu trên NFS `/home-dev` (31 TB)
- **NodePort 30080** — truy cập API gateway qua `http://<node-ip>:30080`
