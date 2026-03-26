Visão Geral

- No conjunto, os ajustes do ajustesv2.md fazem sentido e atacam dores reais de operação: expiração de sessão, guichê “preso”, tickets travados em estados intermediários, reconexão de WS e previsibilidade de data (UTC-3).
- Alguns trechos do documento estão inconsistentes/arriscados do jeito que estão escritos (principalmente itens 2, 3, 4, 8 e 10). Eu implementaria esses pontos só após pequenos acertos de lógica e de segurança.
Análise Por Item

- 1) Wrapper de fetch + logout em 401
  
  - Faz sentido e é uma boa prática para padronizar headers/token e tratar 401 em um lugar só.
  - Pontos de atenção:
    - Redirecionar via window.location.href funciona, mas pode gerar loop se o /login também fizer chamadas que retornem 401 sem exceção.
    - O wrapper como está força Content-Type: application/json sempre; isso pode atrapalhar uploads (FormData) e alguns endpoints GET sem body.
    - Melhor acoplar ao fluxo do AuthContext.logout() (quando existir) para manter estado de React consistente, não só localStorage .
- 2) Liberar guichê após fechar browser (WS close + timeout 2 min)
  
  - A ideia faz sentido: evita liberar guichê por queda momentânea de rede.
  - Problemas no pseudocódigo do documento:
    - Ele agenda setTimeout(...) , mas em seguida faz wsSessionMap.delete(ws) . Isso impede qualquer cancelamento futuro via mapa (e o “cancelar release pendente” na reconexão não funcionaria para um novo WebSocket, porque a chave mudou).
    - O cliente manda user_id e workstation_id “no braço” via WS. Do ponto de vista de segurança, isso é frágil: o servidor deveria validar via token (ex.: enviar JWT no WS e o servidor extrai o userId ).
  - Conclusão: faz sentido como ajuste, mas o design do rastreio precisa ser por workstationId / userId (não por ws ), e a autenticação do WS precisa ser confiável.
- 3) Job automático para tickets presos em calling / in_attendance
  
  - Faz sentido operacionalmente (limpa “lixo” e evita filas travadas).
  - Inconsistências no texto/código do documento:
    - Ele diz “marcar como missed”, mas o exemplo para in_attendance marca como finished (o correto aqui é missed).
    - As cláusulas de data estão suspeitas: em alguns trechos aparece date(created_at) = date('now', '-3 hours') , mas o correto tende a ser ajustar os dois lados (created_at e “agora”) ou, melhor, comparar por intervalo calculado (ver item 4).
  - Recomendações:
    - Tornar as atualizações atômicas (ex.: UPDATE ... WHERE id=? AND status='calling') para evitar corrida com atendimentos reais.
    - Indexar colunas usadas pelo job (status + timestamps) se o volume crescer.
- 4) Fuso horário — zerar numeração à meia-noite de Brasília
  
  - O objetivo faz sentido (no SQLite CURRENT_TIMESTAMP costuma ser UTC).
  - Mas “trocar tudo para date('now', '-3 hours') ” sozinho não garante consistência: normalmente você precisa ajustar os dois lados da comparação ( created_at e o “agora”), senão cria discrepâncias perto da meia-noite.
  - Melhor alternativa (se quiser robustez): calcular “início/fim do dia” em JS no fuso esperado e comparar por intervalo ( created_at >= start AND created_at < end ).
- 5) Reconexão WS disparar refetch
  
  - Faz sentido e melhora a confiabilidade do painel (principalmente TV/Display).
  - Ponto de atenção: garantir que on/off realmente removam listeners no unmount, senão vaza callback e duplica fetch.
- 6) Indicador visual de conexão WS
  
  - Faz sentido (UX) e é baixo risco.
  - Observação: o documento sugere criar componente novo; isso é ok como prática, mas dá para implementar inline se quiser minimizar arquivos.
- 7) Aviso de áudio bloqueado
  
  - Faz sentido: browsers bloqueiam autoplay e isso causa “parece que não está chamando”.
  - A estratégia de “play/pause para desbloquear” em clique é adequada.
- 8) Validação de doctor_id no servidor
  
  - A intenção faz sentido (validar entradas).
  - Risco: o documento lista validTypes = ['consulta', 'outros'] , mas o próprio sistema menciona fluxos de “cirurgia” e outros subtipos; se o backend aceitar mais tipos hoje, essa validação pode quebrar funcionalidade.
  - Conclusão: faz sentido, mas precisa alinhar com o modelo real de type/subtype do sistema antes.
- 9) Proteção contra finalização dupla (transições)
  
  - Faz sentido e previne bugs clássicos de “duplo clique”/WS duplicado.
  - Observação: o exemplo só cobre transições a partir de calling e in_attendance . Se a mesma rota também é usada para outras transições, precisa mapear o fluxo completo do sistema (ou validar por regras mais gerais).
- 10) Arquivamento diário + tabela de métricas
  
  - A parte de “tabela de métricas” faz sentido.
  - A parte de “deletar tickets do dia arquivado” é a mais perigosa do documento:
    - Você perde histórico operacional/contábil e capacidade de auditoria.
    - Se der erro no job, pode apagar sem ter salvo corretamente (mesmo com logs).
  - Sugestão conceitual: manter tickets e só agregar em daily_stats (ou mover para tabela de arquivo sem apagar), a menos que exista requisito explícito de retenção.
- 11) Indicador de posto ocupado no Login
  
  - Faz sentido e melhora UX.
  - Só atenção para regras especiais (RET01) e para atualizar a lista em tempo real (WS) se quiser ficar “sempre correto”.
Prioridade Recomendada (Do Jeito Que Está Hoje)

- Aprovados como estão no documento: 5, 6, 7, 9, 11.
- Aprovado com ajuste pontual: 1 (não forçar Content-Type em GETs/uploads; e acoplar o 401 ao AuthContext.logout()).
- Ajustes necessários antes de implementar: 2, 3, 4, 8 e 10 (conforme descrito acima; especialmente evitar confiar em user_id no WS e não deletar tickets após arquivar).
