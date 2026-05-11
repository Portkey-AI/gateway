# Ops: deploy and automation

Эта директория собирает инфраструктурные файлы Gateway в одном месте.

## Что где лежит

- `docker/Dockerfile` - сборка production-образа для Node.js runtime.
- `docker/Dockerfile.dockerignore` - ignore-файл для Docker build context.
- `docker/docker-compose.yaml` - запуск опубликованного образа через Docker Compose.
- `docker/docker-compose.local.yaml` - локальная сборка и запуск текущего checkout через Docker Compose.
- `kubernetes/deployment.yaml` - namespace, Deployment и Service для Kubernetes.
- `cloudflare/wrangler.toml` - конфигурация Cloudflare Workers.
- `automation/github/workflows/` - копии GitHub Actions для публикации, тестов, форматирования и triage.
- `automation/husky/` - копии локальных git hooks.

Важно: рабочие GitHub Actions остаются в `.github/workflows`, а рабочие husky hooks - в `.husky`. GitHub и husky запускают автоматизацию только из этих системных путей; копии в `ops/automation` нужны как единая точка обзора.

## Локальный запуск через Node.js

Требования:

- Node.js 20.x
- npm

Команды:

```sh
npm install
npm run build
npm run start:node
```

Gateway будет доступен:

- API: `http://localhost:8787/v1`
- локальная консоль логов: `http://localhost:8787/public/`

Для разработки без предварительной сборки:

```sh
npm run dev:node
```

Если нужен другой порт:

```sh
node build/start-server.js --port=8790
```

## Локальный запуск через Docker

Собрать образ из текущего репозитория:

```sh
docker build -f ops/docker/Dockerfile -t portkey-gateway:local .
docker run --rm -p 8787:8787 portkey-gateway:local
```

Собрать и запустить текущий код через Compose:

```sh
docker compose -f ops/docker/docker-compose.local.yaml up -d
docker compose -f ops/docker/docker-compose.local.yaml logs -f
```

Запустить опубликованный образ без сборки:

```sh
docker run --rm -p 8787:8787 portkeyai/gateway:latest
docker compose -f ops/docker/docker-compose.yaml up -d
```

Остановить:

```sh
docker compose -f ops/docker/docker-compose.local.yaml down
docker compose -f ops/docker/docker-compose.yaml down
```

## Проверка после запуска

Быстрая проверка, что сервер отвечает:

```sh
curl http://localhost:8787
```

Пример запроса к OpenAI-compatible endpoint:

```sh
curl http://localhost:8787/v1/chat/completions \
  -H "content-type: application/json" \
  -H "x-portkey-provider: openai" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Say gateway is working"}],
    "max_tokens": 20
  }'
```

Ключи провайдеров не нужно хранить в репозитории. Передавайте их через заголовки запроса, переменные окружения или внешний secret manager.

## Cloudflare Workers

Локальный dev-server Cloudflare Workers:

```sh
npm install
npm run dev
```

Deploy в Cloudflare:

```sh
npm run deploy
```

Скрипты `dev` и `deploy` уже используют конфиг `ops/cloudflare/wrangler.toml`.

## Kubernetes

Применить манифест:

```sh
kubectl apply -f ops/kubernetes/deployment.yaml
```

Проверить:

```sh
kubectl get pods -n portkeyai
kubectl get svc -n portkeyai
```

Для локального доступа через port-forward:

```sh
kubectl port-forward -n portkeyai svc/portkeyai 8787:8787
```

Удалить ресурсы:

```sh
kubectl delete -f ops/kubernetes/deployment.yaml
```

## Автоматизация

Активная автоматизация проекта:

- `.github/workflows/check_code_formatting.yml` - проверка Prettier на pull request в `main`.
- `.github/workflows/docker_publish.yml` - публикация Docker image в Docker Hub при GitHub release.
- `.github/workflows/npm_publish.yml` - публикация npm package при GitHub release.
- `.github/workflows/run_tests.yml` - запуск gateway tests по комментарию `run tests` в PR.
- `.github/workflows/link-checker.yml` - проверка markdown-ссылок.
- `.github/workflows/triage-label.yml` - автоматическая метка `triage` на новых issues.
- `.husky/pre-commit` - проверка форматирования, с попыткой автоформата.
- `.husky/pre-push` - `npm run pre-push`, то есть build и тестовый запуск.

Для локальной проверки перед push:

```sh
npm run format:check
npm run build
npm run test:gateway
```
