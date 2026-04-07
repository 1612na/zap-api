# zap-api — API de Dados WhatsApp

API REST hospedada no Render que recebe dados do [zap-classificator](https://github.com/1612na/zap-classificator) (coletor local) e os serve para o Manus CRM.

```
[zap-classificator local] ──POST /ingest/*──▶ [Esta API] ──GET /conversations/*──▶ [Manus CRM]
                                                    │
                                              PostgreSQL (Render)
```

---

## Endpoints

Todos os endpoints exigem o header `X-Api-Key` — exceto `/health`.

### Diagnóstico

```
GET /health
```
Retorna `{"ok":true,"ts":"..."}`. Usado pelo Render para health check. Não requer auth.

---

### Ingestão (recebe do coletor)

```
POST /ingest/contacts
POST /ingest/conversations
POST /ingest/messages
```

Body: `{ "data": [ ...array de registros... ] }` — máximo 500 por lote.

Todos os endpoints de ingestão são **idempotentes** — reenvios não criam duplicatas.

---

### Consulta (serve o Manus)

#### `GET /conversations/summary`

Triagem paginada com 10 mensagens de amostra por conversa.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `page` | int | 1 | Página |
| `limit` | int | 50 | Itens por página (máx 100) |
| `since` | ISO 8601 | — | Conversas com `last_message_at >= since` |
| `updated_after` | ISO 8601 | — | Alias de `since` |

```bash
curl -H "X-Api-Key: $KEY" \
  "https://zap-api-uyyw.onrender.com/conversations/summary?limit=50"
```

---

#### `GET /conversations/updated`

Sync incremental — retorna conversas atualizadas após `since`, ordenadas por `last_message_at ASC`.
Retorna `sync_token` para usar como `since` no próximo ciclo.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `since` | ISO 8601 | **sim** | Timestamp do último sync |
| `limit` | int | 50 | Máx 100 |

```bash
curl -H "X-Api-Key: $KEY" \
  "https://zap-api-uyyw.onrender.com/conversations/updated?since=2026-04-07T10:00:00Z"
```

Resposta:
```json
{
  "data": [
    { "conversation_id": "5511...@s.whatsapp.net", "last_message_at": "2026-04-07T10:05:00.000Z" }
  ],
  "sync_token": "2026-04-07T10:05:00.001Z"
}
```

---

#### `GET /conversations/:id/full`

Histórico completo de uma conversa com paginação por cursor.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `limit` | int | 200 | Máx 500 mensagens |
| `before` | ISO 8601 | — | Cursor: mensagens anteriores a esta data |

```bash
curl -H "X-Api-Key: $KEY" \
  "https://zap-api-uyyw.onrender.com/conversations/5511999998888@s.whatsapp.net/full"

# Paginação: carregar mensagens mais antigas
curl -H "X-Api-Key: $KEY" \
  "https://zap-api-uyyw.onrender.com/conversations/5511999998888@s.whatsapp.net/full?before=2026-04-01T00:00:00Z"
```

---

## Deploy no Render

O repositório contém `render.yaml` com a configuração completa (Web Service + PostgreSQL).

### Primeiro deploy

1. Render Dashboard → **New** → **Blueprint**
2. Conectar o repositório `zap-api`
3. Clicar em **Apply** — cria o Web Service e o banco automaticamente
4. Após o deploy, ir em **zap-api → Environment** e preencher:
   ```
   COLLECTOR_API_KEY = <valor de openssl rand -hex 32>
   ```
5. Salvar — o serviço reinicia com a chave configurada
6. Copiar o mesmo valor para `RENDER_API_KEY` no `.env` do zap-classificator

### Verificar

```bash
curl https://zap-api-uyyw.onrender.com/health
# {"ok":true,"ts":"..."}
```

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | **sim** | Connection string PostgreSQL (preenchida automaticamente pelo Render) |
| `COLLECTOR_API_KEY` | **sim** | Chave secreta compartilhada com o coletor — preencher manualmente |
| `NODE_ENV` | — | Definido como `production` pelo render.yaml |
| `PORT` | — | Definido automaticamente pelo Render (padrão 10000) |

---

## Desenvolvimento local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar .env
cp .env.example .env
# Preencher DATABASE_URL com um PostgreSQL local e COLLECTOR_API_KEY com qualquer valor

# 3. Rodar migrations
npm run db:migrate

# 4. Iniciar em modo desenvolvimento
npm run dev
# Servidor em http://localhost:3001
```

**Comandos:**
```bash
npm run dev           # inicia com tsx (hot reload)
npm run build         # compila TypeScript para dist/
npm start             # inicia a partir do build compilado
npm run typecheck     # verifica erros TypeScript
npm run db:generate   # gera migration após alterar src/db/schema.ts
npm run db:migrate    # aplica migrations pendentes
```

---

## Aviso sobre o plano free do Render

O Web Service no plano free **hiberna após 15 minutos sem requests**. O primeiro acesso após hibernação leva ~30 segundos (cold start). Como o Manus faz polling a cada 2 minutos, o serviço permanece ativo durante o uso normal. Para garantir uptime 24/7 sem cold start, considerar o plano pago ($7/mês).
