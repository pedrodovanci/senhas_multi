# Ajustes Prioritários — SGA

Olá! Após uma análise do código do sistema, identificamos **5 pontos que precisam ser corrigidos** antes de continuar o uso em produção. São todos pequenos — estimativa de 2h no total.

Contexto: a rede da clínica é física (sem WiFi), então problemas de acesso externo não são preocupação. Os itens abaixo são os que ainda representam risco real nesse cenário.

---

## 1. JWT Secret hardcoded no código

**Arquivo:** `serversrc/src/middleware/auth.ts`

```ts
// ❌ Situação atual
const SECRET_KEY = process.env.JWT_SECRET || 'sga-secret-key-change-me-in-prod';
```

O problema: se o arquivo `.env` não existir, o sistema usa um secret público e previsível. Qualquer pessoa com acesso ao código consegue forjar tokens e se autenticar como admin sem saber a senha.

**O que fazer:**

1. Gerar um secret aleatório seguro (exemplo via terminal: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
2. Criar o arquivo `.env` na raiz do servidor com: `JWT_SECRET=<valor gerado>`
3. Garantir que `.env` está no `.gitignore`
4. Fazer o servidor recusar iniciar se `JWT_SECRET` não estiver definido:

```ts
// ✅ Como deve ficar
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  console.error('FATAL: JWT_SECRET não definido no .env. O servidor não pode iniciar.');
  process.exit(1);
}
```

---

## 2. SQL Injection na rota `/api/tickets/waiting-stats`

**Arquivo:** `serversrc/src/index.ts`

```ts
// ❌ Situação atual — queue_sector é concatenado diretamente na query
const sectorFilter = queue_sector
  ? `AND queue_sector = '${queue_sector}'`
  : `AND queue_sector = 'recepcao'`;
```

O problema: um usuário logado no sistema pode manipular esse parâmetro via DevTools do browser e executar SQL arbitrário no banco — sem precisar de nenhum acesso especial à rede.

**O que fazer:** usar parâmetros preparados, igual ao padrão já adotado em todas as outras rotas do arquivo:

```ts
// ✅ Como deve ficar
const sectorValue = (queue_sector as string) || 'recepcao';

const waitingCount = await db.get(
  `SELECT count(*) as count FROM tickets
   WHERE status = 'waiting' AND doctor_id = ?
   AND date(created_at) = date('now')
   AND queue_sector = ?`,
  [doc.id, sectorValue]
);
```

Aplicar o mesmo padrão para a query do `oldest` e para a query de `supportCount` logo abaixo.

---

## 3. Credenciais do totem expostas no frontend

**Arquivo:** `src/src/pages/Login.tsx`

```ts
// ❌ Situação atual — usuário e senha visíveis no código JS enviado ao browser
setUsername('totem');
setPassword('totem');
```

O problema: qualquer funcionário que abra o DevTools do browser consegue ver essas credenciais. Com elas, pode emitir tickets ou interagir com a API autenticado como totem.

**O que fazer:** criar uma rota dedicada no servidor para o login do totem, sem expor credenciais no frontend:

```ts
// No servidor — nova rota pública
app.post('/api/totem-login', async (req, res) => {
  const { workstation_id } = req.body;
  const totem = await db.get("SELECT * FROM users WHERE username = 'totem'");
  const token = generateToken(totem);
  // ... lógica de lock do workstation igual ao /api/login normal
  res.json({ success: true, token, user: { id: totem.id, username: totem.username, role: totem.role } });
});
```

```ts
// No frontend Login.tsx — substituir o preenchimento automático por:
if (isRetirada) {
  const res = await fetch(`${API_URL}/api/totem-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workstation_id: workstationId })
  });
  const data = await res.json();
  if (data.success) {
    login(data.user, data.token, selectedWs);
    navigate('/recepcao/consultas');
  }
}
```

---

## 4. Race condition no `call-random` — falta de transação atômica

**Arquivo:** `serversrc/src/index.ts` — rota `POST /api/tickets/call-random`

O problema: essa rota busca os tickets em espera e escolhe um aleatoriamente, mas **não usa `BEGIN IMMEDIATE`** como as rotas `call-next` e `call-specific` já fazem. Se dois atendentes clicarem "chamar" ao mesmo tempo, podem chamar o mesmo ticket.

**O que fazer:** envolver a lógica em uma transação, igual ao padrão já existente nas outras rotas:

```ts
// ✅ Como deve ficar
app.post('/api/tickets/call-random', verifyToken, async (req, res) => {
  const { workstation_id, user_id } = req.body;
  try {
    await db.run('BEGIN IMMEDIATE');

    const tickets = await db.all(
      `SELECT * FROM tickets WHERE status = 'waiting' AND date(created_at) = date('now')`
    );

    if (tickets.length === 0) {
      await db.run('ROLLBACK');
      return res.status(404).json({ message: 'Nenhuma senha aguardando.' });
    }

    const ticket = tickets[Math.floor(Math.random() * tickets.length)];

    const result = await db.run(
      `UPDATE tickets SET status = 'calling', workstation_id = ?, called_by_user_id = ?,
       called_at = CURRENT_TIMESTAMP, call_type = 'RANDOM'
       WHERE id = ? AND status = 'waiting'`,
      [workstation_id, user_id, ticket.id]
    );

    if (result.changes === 0) {
      await db.run('ROLLBACK');
      return res.status(409).json({ message: 'Senha já foi chamada por outro atendente.' });
    }

    await db.run('COMMIT');

    const updatedTicket = await db.get(
      `SELECT t.*, d.name as doctor_name, w.name as workstation_name, w.code as workstation_code
       FROM tickets t
       LEFT JOIN doctors d ON t.doctor_id = d.id
       LEFT JOIN workstations w ON t.workstation_id = w.id
       WHERE t.id = ?`,
      ticket.id
    );

    broadcast('ticket:calling', updatedTicket);
    res.json(updatedTicket);
  } catch (err: any) {
    await db.run('ROLLBACK').catch(() => {});
    res.status(500).json({ message: 'Erro ao chamar senha. Tente novamente.' });
  }
});
```

---

## 5. Race condition na geração do número do ticket

**Arquivo:** `serversrc/src/index.ts` — rota `POST /api/tickets`

```ts
// ❌ Situação atual — SELECT e INSERT separados, sem lock entre eles
const countResult = await db.get(
  'SELECT count(*) as count FROM tickets WHERE date(created_at) = date("now")'
);
const nextNum = (countResult?.count || 0) + 1;
const ticketNumber = `${prefix}${String(nextNum).padStart(3, '0')}`;
// ... INSERT logo depois, mas outro request pode ter feito o mesmo entre as duas linhas
```

O problema: se duas senhas forem emitidas quase simultaneamente (ex: dois atendentes na recepção), ambas podem receber o mesmo número (ex: dois `C007`).

**O que fazer:** gerar o número *após* o INSERT, usando o `lastID` retornado pelo banco — que é sempre único:

```ts
// ✅ Como deve ficar
// 1. Inserir sem número ainda
const result = await db.run(
  "INSERT INTO tickets (number, doctor_id, type, subtype, queue_sector, status) VALUES (?, ?, ?, ?, ?, ?)",
  ['TEMP', doctor_id || null, type || 'consulta', subtype || null, queue_sector, 'waiting']
);

// 2. Gerar número baseado no ID único gerado pelo banco
const ticketNumber = `${prefix}${String(result.lastID).padStart(3, '0')}`;

// 3. Atualizar com o número correto
await db.run("UPDATE tickets SET number = ? WHERE id = ?", [ticketNumber, result.lastID]);
```

> **Nota:** isso muda a numeração de sequencial-por-dia para sequencial-global, mas garante unicidade absoluta. Se a numeração diária for um requisito, podemos discutir uma alternativa com tabela de sequências.

---

## Resumo

| # | Problema | Arquivo | Esforço estimado |
|---|----------|---------|-----------------|
| 1 | JWT Secret hardcoded | `middleware/auth.ts` | ~15 min |
| 2 | SQL Injection em waiting-stats | `index.ts` | ~15 min |
| 3 | Credenciais do totem no frontend | `Login.tsx` + `index.ts` | ~45 min |
| 4 | call-random sem transação atômica | `index.ts` | ~20 min |
| 5 | Race condition no número do ticket | `index.ts` | ~30 min |

Qualquer dúvida, estamos à disposição. Obrigado!