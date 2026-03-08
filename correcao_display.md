# Correções — Painel Display

Ajustes visuais e de dados a aplicar no componente do painel de exibição.
Nenhuma mudança de lógica de negócio — apenas layout, tamanhos e formatação de texto.

---

## 1. Card da senha — aumentar tamanho

O card principal (esquerda) está pequeno. Aumentar largura e altura mínima.

**Localizar** o estilo do card principal e ajustar:

```css
/* ANTES */
width: ~480px;      /* ou o valor atual */
min-height: auto;

/* DEPOIS */
width: clamp(480px, 38vw, 620px);
min-height: 420px;
padding: 48px 52px;
```

O número da senha também pode crescer proporcionalmente:

```css
/* ANTES */
font-size: clamp(100px, 14vw, 160px);

/* DEPOIS */
font-size: clamp(120px, 16vw, 200px);
```

---

## 2. Guichê — remover sufixo "G" e padronizar texto

O texto do guichê está exibindo `GUICHÊ G01` com a letra G vinda do `workstation_code`. Deve exibir apenas `GUICHÊ 01`.

**Localizar** onde o `workstation_code` é usado para montar o texto do guichê e aplicar a limpeza:

```typescript
// Função auxiliar para formatar o nome do guichê
const formatWorkstation = (name?: string, code?: string): string => {
  // Prefere o nome completo se disponível
  if (name) return name.toUpperCase();
  // Fallback: remove letras do prefixo e exibe só o número
  const number = code?.replace(/[^0-9]/g, "") ?? "";
  return `GUICHÊ ${number}`;
};
```

**Uso no JSX:**

```tsx
// ANTES
<span>{currentTicket.workstation_name || `GUICHÊ ${currentTicket.workstation_code}`}</span>

// DEPOIS
<span>{formatWorkstation(currentTicket.workstation_name, currentTicket.workstation_code)}</span>
```

> **Nota:** O ideal é corrigir diretamente no banco/cadastro, garantindo que `workstation_name` esteja preenchido com `"GUICHÊ 01"`, `"GUICHÊ 02"`, `"CIRURGIA"` etc. Assim o frontend apenas exibe o valor sem precisar de lógica de formatação.

---

## 3. Remover "Clínico Geral" e exibir nome do médico

O campo "Profissional" exibe atualmente o texto fixo "Clínico Geral" (que vem da especialização do médico). Deve exibir o **nome do médico** vinculado à senha.

### 3.1 Verificar se o campo `doctor_name` chega no ticket

O endpoint já faz `JOIN` com a tabela `doctors`, então `doctor_name` deve estar disponível no objeto `CalledTicket`. Confirmar:

```typescript
interface CalledTicket {
  // ...campos existentes...
  doctor_name?: string;  // deve estar presente — vem do JOIN no backend
}
```

### 3.2 Atualizar o JSX

```tsx
// ANTES
<span>Clínico Geral</span>   {/* ou currentTicket.specialization */}

// DEPOIS — exibe o nome do médico, ou oculta o campo se não houver médico vinculado
{currentTicket.doctor_name && (
  <div className="meta-item">
    <span className="meta-label">Profissional</span>
    <span className="meta-value-doctor">{currentTicket.doctor_name}</span>
  </div>
)}
```

> Senhas do tipo `outros` (apoio, agendamento cirúrgico) não têm médico vinculado — o campo deve simplesmente não aparecer nesses casos, por isso o wrapper condicional `{currentTicket.doctor_name && ...}`.

---

## 4. Card "Últimas Chamadas" — estreitar e mostrar nome do guichê

### 4.1 Diminuir a largura do card

```css
/* ANTES */
width: ~650px;    /* ou o valor atual */

/* DEPOIS */
width: clamp(340px, 28vw, 480px);
```

### 4.2 Exibir nome do guichê em destaque em cada linha

Cada item do histórico deve mostrar o guichê de forma legível, sem abreviações como `CIR01` ou `G01`.

Aplicar a mesma função `formatWorkstation` do item 2:

```tsx
// ANTES
<span className="history-guiche">{t.workstation_code}</span>

// DEPOIS
<span className="history-guiche">
  {formatWorkstation(t.workstation_name, t.workstation_code)}
</span>
```

**Resultado esperado em cada linha:**

```
AP025    GUICHÊ 01    17:03
AC026    CIRURGIA     17:03
C024     GUICHÊ 02    16:58
```

---

## 5. Card "Últimas Chamadas" — mover mais para a direita

O card deve estar encostado mais próximo à borda direita da tela, dentro da área clara da arte.

**Localizar** o posicionamento do painel direito e ajustar:

```css
/* ANTES */
right: 48px;   /* ou margin/padding equivalente */

/* DEPOIS */
right: 24px;   /* aproximar da borda direita */
```

Se o layout usar `flex` com `gap`, reduzir o gap entre os painéis também ajuda a empurrar o direito para a borda:

```css
/* ANTES */
gap: 32px;

/* DEPOIS */
gap: 16px;
```

---

## 6. Data e hora — encaixar nos retângulos da arte

A arte tem dois retângulos sobrepostos no canto superior direito reservados para data (retângulo de cima) e hora (retângulo de baixo). Os valores devem ser posicionados **dentro** desses elementos, nessa ordem:

```
┌─────────────────┐  ← retângulo superior
│  05/03/2026     │
└─────────────────┘
┌─────────────────┐  ← retângulo inferior
│  15:42          │
└─────────────────┘
```

### 6.1 Formato da data

```typescript
// ANTES — formato por extenso ("QUINTA-FEIRA, 5 DE MARÇO DE 2026")
// DEPOIS — formato numérico dd/mm/aaaa
const dateStr = `${now.getDate().toString().padStart(2,"0")}/${(now.getMonth()+1).toString().padStart(2,"0")}/${now.getFullYear()}`;
```

### 6.2 Posicionamento e layout

Separar data e hora em dois blocos distintos, alinhados com os retângulos da arte:

```tsx
<div className="clock-block">
  {/* Retângulo superior — DATA */}
  <div className="clock-date-box">
    {dateStr}   {/* Ex: 05/03/2026 */}
  </div>

  {/* Retângulo inferior — HORA */}
  <div className="clock-time-box">
    {hh}<span className="sep">:</span>{mm}
  </div>
</div>
```

```css
.clock-block {
  position: absolute;
  top: 60px;          /* ajustar até alinhar com o retângulo superior da arte */
  right: 48px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;           /* espaço entre os dois retângulos */
}

.clock-date-box {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.85);
  /* Ajustar top/right por pixel até encaixar no retângulo da arte */
}

.clock-time-box {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 64px;
  letter-spacing: 4px;
  color: #ffffff;
  line-height: 1;
  /* Ajustar até encaixar no retângulo inferior da arte */
}

.sep {
  opacity: 0.5;
  animation: blink 1s step-end infinite;
}
```

> **Dica de alinhamento:** os retângulos da arte são elementos decorativos fixos na imagem de fundo. Use `position: absolute` com ajuste fino de `top` e `right` em pixels até os textos ficarem visualmente dentro de cada retângulo. Recomenda-se testar em resolução 1920×1080.

---

## Resumo das alterações

| # | Elemento | O que muda |
|---|---|---|
| 1 | Card da senha | Aumentar largura, altura mínima e tamanho do número |
| 2 | Texto do guichê | Remover letra prefixo — exibir `GUICHÊ 01` em vez de `GUICHÊ G01` |
| 3 | Campo profissional | Remover especialização fixa — exibir `doctor_name` do ticket, ocultar se vazio |
| 4 | Card histórico | Estreitar largura + mostrar nome do guichê legível por extenso |
| 5 | Posição do histórico | Mover mais para a direita da tela |
| 6 | Data e hora | Separar em dois blocos — data `dd/mm/aaaa` acima, hora abaixo — encaixar nos retângulos da arte |