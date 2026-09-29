# Commands

Quy trình Git từ kiểm dirty tree, stage/rename, commit, push, verify SHA đến PR nằm tại [git-workflow.md](git-workflow.md).

## Backend

```bash
cd backend
npm run dev                 # tsx watch src/app.ts
npm test                    # Vitest Community baseline
npx tsc --noEmit            # typecheck không ghi dist
npm run build               # emit dist
npx prisma generate
npx prisma migrate dev --name <name>   # chỉ development
npx prisma migrate status
```

Production migration:

```bash
docker exec zalo-crm-app npx prisma migrate deploy
```

## Frontend

```bash
cd frontend
npm run dev
npm test
npx vue-tsc --noEmit
npm run build
npm run preview
```

## Operations

```bash
docker compose ps
docker compose logs --tail 100 app
curl http://localhost:3080/health
./scripts/zalocrm-deploy.sh install|upgrade|backup
```

Không có script lint trong hai `package.json`; không tuyên bố lint gate tồn tại.
# WSL quick start

```bash
./bin/wsl-setup
cd ~/src/zalo-crm-solar
docker compose up -d db redis minio minio-init
./bin/dev-setup
```

Build/test native trong WSL dùng Node.js 22:

```bash
cd backend && npm test && npm run build
cd ../frontend && npm test && npm run build
```

Không dùng `docker compose down -v`, `prisma migrate reset` hoặc xóa volume khi
chuyển môi trường. Các volume Docker hiện tại độc lập với vị trí source.
