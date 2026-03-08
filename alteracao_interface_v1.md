# Alterações de Interface — Recepção e Terminal do Atendente

> Três mudanças visuais e comportamentais com base nas telas apresentadas. Todos os arquivos e trechos de código são referenciados com precisão.

---

## Mudança 1 — Cards menores, sem ícone, fundo mais escuro (`/recepcao/consultas` e `/atendente`)

Afeta dois componentes: o card da recepção (`Reception.tsx`) e o card do atendente (`DoctorQueueCard.tsx`).

### 1a — Fundo da página mais escuro

**Arquivo: `client/src/pages/Reception.tsx`**

```tsx
// ALTERAR a classe da div principal:
// DE:
<div className="min-h-screen bg-gray-50 p-8 relative print:hidden">

// PARA:
<div className="min-h-screen bg-gray-200 p-8 relative print:hidden">
```

**Arquivo: `client/src/pages/Attendant.tsx`**

```tsx
// ALTERAR a classe da div principal:
// DE:
<div className="min-h-screen bg-gray-100 flex flex-col">

// PARA:
<div className="min-h-screen bg-gray-200 flex flex-col">
```

---

### 1b — Cards menores e sem ícone na Recepção

**Arquivo: `client/src/pages/Reception.tsx`**

Localizar o bloco de cada card de médico dentro do `.map(doctor => (...))` e substituir:

```tsx
// DE — card atual com ícone grande e padding generoso:
<button
  key={doctor.id}
  onClick={() => generateTicket(doctor.id)}
  disabled={loading}
  className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-xl transition-all transform hover:-translate-y-1 border border-gray-100 flex flex-col items-center group relative overflow-hidden"
>
  <div className={`absolute top-0 left-0 w-2 h-full ${...} transition-colors duration-300`} />
  <div className={`p-4 rounded-full mb-4 ...`}>
    <User className="w-10 h-10" />   {/* <- ÍCONE A REMOVER */}
  </div>
  <h3 className="text-lg font-bold text-gray-800 mb-1 text-center">{doctor.name}</h3>
  <p className="text-gray-500 font-medium text-sm text-center">{doctor.specialization}</p>
</button>

// PARA — card compacto, sem ícone, apenas nome e especialidade:
<button
  key={doctor.id}
  onClick={() => generateTicket(doctor.id)}
  disabled={loading}
  className="bg-white py-4 px-5 rounded-xl shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5 border border-gray-100 flex flex-col justify-center group relative overflow-hidden min-h-[80px]"
>
  <div className={`absolute top-0 left-0 w-1.5 h-full ${ticketType === 'consulta' ? 'bg-primary' : 'bg-secondary'} transition-colors duration-300`} />
  <h3 className="text-base font-bold text-gray-800 leading-tight pl-1">{doctor.name}</h3>
  <p className="text-gray-400 text-xs mt-0.5 pl-1">{doctor.specialization}</p>
</button>
```

**Também ajustar o grid para caber mais cards por linha** (já que ficaram menores):

```tsx
// DE:
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

// PARA:
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
```

---

### 1c — Cards menores no Terminal do Atendente

**Arquivo: `client/src/components/DoctorQueueCard.tsx`**

```tsx
// Remover o bloco do ícone inteiro:
// DE:
<div className="flex items-center gap-3 mb-4">
  <div className={`p-2 rounded-full ${waitingCount > 0 ? 'bg-primary/10 text-primary' : 'bg-gray-200 text-gray-400'}`}>
    <User className="w-5 h-5" />   {/* <- REMOVER */}
  </div>
  <h3 className={`font-bold text-lg leading-tight ${...}`}>
    {doctorName}
  </h3>
</div>

// PARA — apenas o nome, sem ícone e com menos margem:
<div className="mb-3">
  <h3 className={`font-bold text-base leading-tight ${waitingCount > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
    {doctorName}
  </h3>
</div>
```

**Reduzir o padding e espaçamento interno do card:**

```tsx
// DE:
<div className={`bg-white rounded-xl shadow-sm border p-5 flex flex-col justify-between h-full transition-all ${...}`}>

// PARA:
<div className={`bg-white rounded-xl shadow-sm border p-4 flex flex-col justify-between h-full transition-all ${...}`}>
```

**Reduzir margem entre os campos Espera/Fila:**

```tsx
// DE:
<div className="grid grid-cols-2 gap-4 mb-6">

// PARA:
<div className="grid grid-cols-2 gap-3 mb-4">
```

**Remover o import de `User`** (não é mais usado):

```tsx
// DE:
import { User, ArrowRight } from 'lucide-react';

// PARA:
import { ArrowRight } from 'lucide-react';
```

---

## Mudança 2 — Aba "CIRURGIAS" → "OUTROS" com cards fixos de Agendamento Cirúrgico e Apoio

### Contexto

A aba "Outros" não lista médicos do banco — ela exibe dois cards fixos e imutáveis: **Agendamento Cirúrgico** e **Apoio**. Ao clicar em um deles, gera uma senha do tipo `outros` sem vínculo com nenhum médico (`doctor_id = null`), usando um campo `subtype` para distinguir qual dos dois foi selecionado.

### Alterações no Backend

**Arquivo: `server/src/index.ts` — endpoint `POST /api/tickets`**

Adicionar suporte ao campo `subtype` na criação do ticket:

```ts
// DE:
app.post('/api/tickets', async (req, res) => {
  const { doctor_id, type } = req.body;
  const prefix = type === 'cirurgia' ? 'S' : 'C';
  // ...
  const result = await db.run(
    'INSERT INTO tickets (number, doctor_id, type, status) VALUES (?, ?, ?, ?)',
    [ticketNumber, doctor_id, type || 'consulta', 'waiting']
  );

// PARA:
app.post('/api/tickets', async (req, res) => {
  const { doctor_id, type, subtype } = req.body;
  // type: 'consulta' | 'outros'
  // subtype (opcional): 'agendamento_cirurgico' | 'apoio'
  const prefix = type === 'outros' ? 'O' : 'C';
  // ...
  const result = await db.run(
    'INSERT INTO tickets (number, doctor_id, type, subtype, status) VALUES (?, ?, ?, ?, ?)',
    [ticketNumber, doctor_id || null, type || 'consulta', subtype || null, 'waiting']
  );
```

**Arquivo: `server/src/database.ts` — migration**

Adicionar a coluna `subtype` à tabela tickets:

```ts
// Adicionar dentro do bloco de migrations (junto com os outros ALTER TABLE):
try {
  await db.run("ALTER TABLE tickets ADD COLUMN subtype TEXT");
} catch (e) {
  // Coluna já existe
}
```

**Arquivo: `server/src/database.ts` — CHECK constraint**

Atualizar o CHECK da coluna `type` na criação da tabela para aceitar `'outros'`:

```sql
-- DE:
type TEXT CHECK(type IN ('consulta', 'cirurgia')),

-- PARA:
type TEXT CHECK(type IN ('consulta', 'outros')),
```

> ⚠️ Esta alteração no `CREATE TABLE` só afeta bancos novos. Para o banco existente, a migration com `ALTER TABLE` e a remoção do check antigo é suficiente. Se preferir recriar o banco em dev para limpar, basta deletar o `database.sqlite` e reiniciar o servidor.

---

### Alterações no Frontend

**Arquivo: `client/src/pages/Reception.tsx`**

**Passo 1 — Alterar o tipo do estado e o label do botão:**

```tsx
// DE:
const [ticketType, setTicketType] = useState<'consulta' | 'cirurgia'>('consulta');

// PARA:
const [ticketType, setTicketType] = useState<'consulta' | 'outros'>('consulta');
```

```tsx
// DE (botão da aba):
<button onClick={() => setTicketType('cirurgia')} ...>
  <Scissors className="mr-3 w-6 h-6" />
  CIRURGIAS
</button>

// PARA:
<button onClick={() => setTicketType('outros')} ...>
  <LayoutGrid className="mr-3 w-6 h-6" />  {/* Importar LayoutGrid do lucide-react */}
  OUTROS
</button>
```

**Passo 2 — Criar os dois cards fixos para a aba "Outros":**

Substituir o grid de médicos por uma renderização condicional:

```tsx
{ticketType === 'consulta' ? (
  // Grid de médicos — permanece igual
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
    {doctors.map(doctor => (
      // ... cards de médicos
    ))}
  </div>
) : (
  // Dois cards fixos para "Outros"
  <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto mt-8">
    <button
      onClick={() => generateTicket(null, 'agendamento_cirurgico')}
      disabled={loading}
      className="bg-white py-10 px-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1.5 h-full bg-secondary" />
      <Scissors className="w-10 h-10 text-secondary" />
      <span className="text-lg font-bold text-gray-800">Agendamento Cirúrgico</span>
    </button>

    <button
      onClick={() => generateTicket(null, 'apoio')}
      disabled={loading}
      className="bg-white py-10 px-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1.5 h-full bg-gray-400" />
      <HeadphonesIcon className="w-10 h-10 text-gray-500" />  {/* ou outro ícone adequado */}
      <span className="text-lg font-bold text-gray-800">Apoio</span>
    </button>
  </div>
)}
```

**Passo 3 — Atualizar a função `generateTicket` para aceitar `subtype`:**

```tsx
// DE:
const generateTicket = async (doctorId: number) => {
  // ...
  body: JSON.stringify({ doctor_id: doctorId, type: ticketType })

// PARA:
const generateTicket = async (doctorId: number | null, subtype?: string) => {
  // ...
  body: JSON.stringify({
    doctor_id: doctorId,
    type: ticketType,
    ...(subtype && { subtype })  // Envia subtype apenas quando definido
  })
```

**Atualizar os imports necessários no topo do arquivo:**

```tsx
// DE:
import { User, CheckCircle, Stethoscope, Scissors } from 'lucide-react';

// PARA:
import { CheckCircle, Stethoscope, Scissors, LayoutGrid, Headphones } from 'lucide-react';
```

---

## Mudança 3 — Terminal do Atendente: ocultar cards com fila vazia, exibir conforme chegam senhas

### Comportamento atual

O `DoctorQueueGrid` busca todos os médicos cadastrados e exibe um card para cada um, independentemente de haver senhas aguardando. Com 11 médicos, a tela sempre mostra 11 cards, a maioria com "FILA VAZIA".

### Comportamento desejado

- Tela vazia quando não há nenhuma senha aguardando — exibir mensagem amigável
- Card aparece automaticamente quando a primeira senha de um médico chega
- Card desaparece quando o último ticket daquele médico é chamado/finalizado

### Arquivo: `client/src/components/DoctorQueueGrid.tsx`

**Substituir o componente inteiro por:**

```tsx
import React, { useEffect, useState } from 'react';
import DoctorQueueCard from './DoctorQueueCard';
import { Users } from 'lucide-react';

interface DoctorQueueGridProps {
    onCall: (doctorId: number | null) => void;
    disabled: boolean;
    refreshTrigger: number;
}

interface QueueStat {
    doctor_id: number | null;
    doctor_name: string;
    count: number;
    oldest_created_at: string | null;
}

const DoctorQueueGrid: React.FC<DoctorQueueGridProps> = ({ onCall, disabled, refreshTrigger }) => {
    const [stats, setStats] = useState<QueueStat[]>([]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('http://localhost:3000/api/tickets/waiting-stats');
                const data = await res.json();
                if (Array.isArray(data)) {
                    // FILTRAR: mostrar apenas médicos com pelo menos 1 senha aguardando
                    setStats(data.filter((s: QueueStat) => s.count > 0));
                } else {
                    setStats([]);
                }
            } catch (error) {
                console.error('Error fetching queue stats:', error);
            }
        };

        fetchStats();
    }, [refreshTrigger]);

    // Estado vazio — nenhuma senha aguardando
    if (stats.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-24 text-center">
                <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 max-w-sm">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhum paciente aguardando</h3>
                    <p className="text-gray-300 text-sm">Os cards aparecerão aqui conforme as senhas forem geradas.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-2">
            {stats.map((stat) => (
                <DoctorQueueCard
                    key={stat.doctor_id ?? 'support'}
                    doctorName={stat.doctor_name}
                    waitingCount={stat.count}
                    oldestTicketTime={stat.oldest_created_at}
                    onCall={() => onCall(stat.doctor_id)}
                    disabled={disabled}
                />
            ))}
        </div>
    );
};

export default DoctorQueueGrid;
```

**O que mudou:**
- Linha-chave: `data.filter((s: QueueStat) => s.count > 0)` — só guarda no estado médicos com fila ativa
- Estado vazio com mensagem amigável em vez de grid vazio
- O `refreshTrigger` já está conectado ao WebSocket no `Attendant.tsx` — cada evento de ticket (`created`, `calling`, `finished`) já incrementa o trigger e causa um novo fetch, fazendo os cards aparecerem e desaparecerem automaticamente em tempo real

---

## Resumo das Alterações

| Mudança | Arquivo(s) | O que fazer |
|---|---|---|
| Fundo mais escuro | `Reception.tsx`, `Attendant.tsx` | `bg-gray-50/100` → `bg-gray-200` |
| Cards menores sem ícone (recepção) | `Reception.tsx` | Remover `<User>`, reduzir padding, ajustar grid |
| Cards menores sem ícone (atendente) | `DoctorQueueCard.tsx` | Remover bloco do ícone, reduzir espaçamentos |
| Aba "Cirurgias" → "Outros" | `Reception.tsx` + `server/index.ts` + `database.ts` | Renomear label, criar cards fixos, adicionar `subtype` |
| Cards dinâmicos (só com fila) | `DoctorQueueGrid.tsx` | Filtrar `count > 0`, estado vazio amigável |

---

*Alterações de Interface v1.0 — Sistema de Senhas CCC*