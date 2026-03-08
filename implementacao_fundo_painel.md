# Guia de Implementação — Novo Painel de Display (`Display.tsx`)

## Contexto

Este documento orienta a substituição do painel de exibição atual pelo novo componente `Display.tsx`, que utiliza a imagem `FUNDO_SENHAS.png` como fundo e sobrepõe os elementos dinâmicos (senha chamada, histórico, relógio e ticker) diretamente sobre ela.

---

## 1. Arquivos envolvidos

| Arquivo | Ação |
|---|---|
| `Display.tsx` | **Substituir** pelo novo arquivo fornecido |
| `FUNDO_SENHAS.png` | **Mover** para `client/public/FUNDO_SENHAS.png` |

> A imagem precisa estar em `/public` para ser acessada via URL relativa (`/FUNDO_SENHAS.png`) pelo CSS.

---

## 2. Dependências

O componente usa apenas recursos já presentes no projeto. Não há novas bibliotecas a instalar.

- **React** — já instalado
- **lucide-react** — já utilizado no projeto (ícone `Monitor`)
- **Google Fonts** — carregado via `@import` no CSS inline. Requer conexão com a internet na primeira carga. As fontes utilizadas são:
  - `Bebas Neue` — relógio e números das senhas
  - `Barlow Condensed` — labels, guichê, histórico
  - `Barlow` — texto geral

---

## 3. Integração com dados reais

O componente atual tem um `useEffect` com dados **mockados** para visualização. Esse bloco precisa ser substituído pela integração real com a API e o WebSocket já existentes no projeto.

### 3.1 Localizar o bloco mock

```typescript
// ⚠️ REMOVER este bloco inteiro
useEffect(() => {
  setCurrentTicket({ id: 99, number: "C042", ... });
  setHistory([...]);
}, []);
```

### 3.2 Substituir pelo fetch inicial + listener de WebSocket

```typescript
const { token } = useAuth(); // Se o Display exigir autenticação
// Caso o Display seja público (sem login), remover o token e a autenticação

useEffect(() => {

  // 1. Busca o histórico inicial das últimas 5 senhas chamadas
  fetch(`${API_URL}/api/tickets/history?limit=5`)
    .then((res) => res.json())
    .then((data: CalledTicket[]) => {
      if (Array.isArray(data)) setHistory(data);
    })
    .catch(console.error);

  // 2. Busca se há alguma senha sendo chamada no momento
  fetch(`${API_URL}/api/tickets?status=calling`)
    .then((res) => res.json())
    .then((data: CalledTicket[]) => {
      if (Array.isArray(data) && data.length > 0) {
        setCurrentTicket(data[0]);
      }
    })
    .catch(console.error);

  // 3. Escuta eventos em tempo real via WebSocket
  if (socketContext && socketContext.socket) {

    // Quando uma nova senha é chamada
    const handleCalling = (ticket: CalledTicket) => {
      setCurrentTicket(ticket);
      // Adiciona ao topo do histórico e mantém apenas 5
      setHistory((prev) => [ticket, ...prev].slice(0, 5));
    };

    socketContext.on("ticket:calling", handleCalling);

    return () => {
      socketContext.off("ticket:calling", handleCalling);
    };
  }

}, [socketContext]);
```

### 3.3 Importações necessárias no topo do arquivo

```typescript
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { API_URL } from "../config";
```

---

## 4. Interface `CalledTicket`

O tipo já está definido no componente. Confirme que os campos batem com o retorno da sua API:

```typescript
interface CalledTicket {
  id: number;
  number: string;           // Ex: "C042", "AC001", "AP025"
  workstation_code: string; // Ex: "G1"
  workstation_name?: string; // Ex: "GUICHÊ 01" — opcional, exibido se existir
  called_at: string;        // ISO 8601 — Ex: "2026-03-05T14:04:00.000Z"
}
```

> Se o objeto retornado pela API usar nomes diferentes (ex: `code` em vez de `workstation_code`), ajuste o mapeamento no `handleCalling` ou diretamente na interface.

---

## 5. Rota do Display

Verifique se a rota `/display` (ou equivalente) está configurada no `App.tsx` / roteador do projeto:

```typescript
// Em App.tsx ou no arquivo de rotas
import Display from "./pages/Display";

<Route path="/display" element={<Display />} />
```

> O Display normalmente é acessado em um monitor dedicado na recepção, sem necessidade de login. Se quiser protegê-lo, envolva com o guard de autenticação já existente no projeto.

---

## 6. Cores por tipo de senha

O componente já aplica cores automaticamente com base no prefixo da senha:

| Prefixo | Tipo | Cor |
|---|---|---|
| `C` | Consulta | `#00bf63` (verde) |
| `AP` | Apoio | `#60a5fa` (azul) |
| `AC` | Agendamento Cirúrgico | `#a78bfa` (roxo) |
| `O` | Outros | `#fbbf24` (amarelo) |

Se novos prefixos forem criados no futuro, basta adicionar uma linha na função `ticketColor`:

```typescript
const ticketColor = (num: string) => {
  if (num.startsWith("AC")) return "#a78bfa";
  if (num.startsWith("AP")) return "#60a5fa";
  if (num.startsWith("C"))  return "#00bf63";
  return "#fbbf24"; // fallback para qualquer outro prefixo
};
```

---

## 7. Texto do rodapé (ticker)

O texto que rola no rodapé está na constante `TICKER_TEXT`. Para alterar o conteúdo, basta editar essa linha:

```typescript
const TICKER_TEXT =
  "BEM-VINDO AO CENTRO DO CÉREBRO E COLUNA  •  HORÁRIO DE ATENDIMENTO: 08:00 ÀS 18:00  •  EM CASO DE DÚVIDAS, PROCURE A RECEPÇÃO  •  MANTENHA O SILÊNCIO  •  ";
```

> O texto é duplicado no JSX (`{TICKER_TEXT}{TICKER_TEXT}`) para garantir que o ticker pareça contínuo sem gaps visíveis durante o loop.

---

## 8. Checklist de implementação

- [ ] Mover `FUNDO_SENHAS.png` para `client/public/`
- [ ] Substituir o arquivo `Display.tsx` pelo novo
- [ ] Remover o bloco `useEffect` com dados mockados
- [ ] Adicionar as importações de `useAuth`, `useSocket` e `API_URL`
- [ ] Implementar o `useEffect` de integração real (seção 3.2)
- [ ] Confirmar que a rota `/display` está registrada no roteador
- [ ] Confirmar que os campos de `CalledTicket` batem com o retorno da API
- [ ] Testar em resolução 1920×1080 (resolução alvo do painel)
- [ ] Validar que o WebSocket dispara `ticket:calling` e atualiza o painel em tempo real