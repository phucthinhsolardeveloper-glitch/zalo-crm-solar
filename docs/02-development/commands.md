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
