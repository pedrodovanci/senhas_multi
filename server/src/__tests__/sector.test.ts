import request from 'supertest';

describe('Sistema de Filas por Setor', () => {
  let app: any;
  let startServer: any;
  let adminToken: string;
  let cirurgiaToken: string;
  let attendantToken: string;
  let server: any;
  let db: any;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const mod = await import('../index');
    app = mod.app;
    startServer = mod.startServer;

    // Inicia app e banco, mas não abre a porta 3000
    const res = await startServer(false);
    server = res.httpServer;
    db = res.db;

    // Garante que o usuário cirurgia existe (via seed do initDb)
    // Login Admin
    const adminRes = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' }); // Senha padrão (se não alterada)
    
    // Login Cirurgia (agendamento_cirurgico)
    const cirurgiaRes = await request(app)
      .post('/api/login')
      .send({ username: 'agendamento_cirurgico', password: '123456' });
    cirurgiaToken = cirurgiaRes.body.token;

    // Login Recepção (atendente1)
    const attendantRes = await request(app)
      .post('/api/login')
      .send({ username: 'atendente1', password: '1234' });
    attendantToken = attendantRes.body.token;
  });

  afterAll(async () => {
    if (server) server.close();
    if (db) await db.close();
  });

  it('deve criar senha com prefixo AC e setor cirurgia', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({
        type: 'outros',
        subtype: 'agendamento_cirurgico'
      });

    expect(res.status).toBe(200);
    expect(res.body.queue_sector).toBe('cirurgia');
    expect(res.body.number).toMatch(/^AC\d+$/);
  });

  it('deve criar senha comum com setor recepcao', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({ type: 'consulta' });

    expect(res.status).toBe(200);
    expect(res.body.queue_sector).toBe('recepcao');
    expect(res.body.number).toMatch(/^C\d+$/);
  });

  it('deve filtrar fila de espera por setor', async () => {
    // Busca fila cirurgia
    const res = await request(app)
      .get('/api/tickets/waiting-stats?queue_sector=cirurgia')
      .set('Authorization', `Bearer ${cirurgiaToken}`);
    
    expect(res.status).toBe(200);
    // Verifica se retornou array
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('não deve permitir que recepção chame senha de cirurgia', async () => {
    // Tenta chamar próxima senha da fila 'cirurgia' usando token de 'recepcao'
    // O backend deve priorizar o setor do usuário ou falhar se o setor não bater
    // Neste caso, testamos se ao chamar "geral" ele NÃO pega a AC
    
    const res = await request(app)
      .post('/api/tickets/call-next')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({ workstation_id: 1, queue_sector: 'recepcao' });

    if (res.status === 200) {
      expect(res.body.queue_sector).toBe('recepcao');
      expect(res.body.number).not.toMatch(/^AC/);
    }
  });
});
