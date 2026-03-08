"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
describe('Sistema de Filas por Setor', () => {
    let app;
    let startServer;
    let adminToken;
    let cirurgiaToken;
    let attendantToken;
    let server;
    let db;
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
        const mod = yield Promise.resolve().then(() => __importStar(require('../index')));
        app = mod.app;
        startServer = mod.startServer;
        // Inicia app e banco, mas não abre a porta 3000
        const res = yield startServer(false);
        server = res.httpServer;
        db = res.db;
        // Garante que o usuário cirurgia existe (via seed do initDb)
        // Login Admin
        const adminRes = yield (0, supertest_1.default)(app)
            .post('/api/login')
            .send({ username: 'admin', password: 'admin' }); // Senha padrão (se não alterada)
        // Login Cirurgia (agendamento_cirurgico)
        const cirurgiaRes = yield (0, supertest_1.default)(app)
            .post('/api/login')
            .send({ username: 'agendamento_cirurgico', password: '123456' });
        cirurgiaToken = cirurgiaRes.body.token;
        // Login Recepção (atendente1)
        const attendantRes = yield (0, supertest_1.default)(app)
            .post('/api/login')
            .send({ username: 'atendente1', password: '1234' });
        attendantToken = attendantRes.body.token;
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        if (server)
            server.close();
        if (db)
            yield db.close();
    }));
    it('deve criar senha com prefixo AC e setor cirurgia', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${attendantToken}`)
            .send({
            type: 'outros',
            subtype: 'agendamento_cirurgico'
        });
        expect(res.status).toBe(200);
        expect(res.body.queue_sector).toBe('cirurgia');
        expect(res.body.number).toMatch(/^AC\d+$/);
    }));
    it('deve criar senha comum com setor recepcao', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${attendantToken}`)
            .send({ type: 'consulta' });
        expect(res.status).toBe(200);
        expect(res.body.queue_sector).toBe('recepcao');
        expect(res.body.number).toMatch(/^C\d+$/);
    }));
    it('deve filtrar fila de espera por setor', () => __awaiter(void 0, void 0, void 0, function* () {
        // Busca fila cirurgia
        const res = yield (0, supertest_1.default)(app)
            .get('/api/tickets/waiting-stats?queue_sector=cirurgia')
            .set('Authorization', `Bearer ${cirurgiaToken}`);
        expect(res.status).toBe(200);
        // Verifica se retornou array
        expect(Array.isArray(res.body)).toBe(true);
    }));
    it('não deve permitir que recepção chame senha de cirurgia', () => __awaiter(void 0, void 0, void 0, function* () {
        // Tenta chamar próxima senha da fila 'cirurgia' usando token de 'recepcao'
        // O backend deve priorizar o setor do usuário ou falhar se o setor não bater
        // Neste caso, testamos se ao chamar "geral" ele NÃO pega a AC
        const res = yield (0, supertest_1.default)(app)
            .post('/api/tickets/call-next')
            .set('Authorization', `Bearer ${attendantToken}`)
            .send({ workstation_id: 1, queue_sector: 'recepcao' });
        if (res.status === 200) {
            expect(res.body.queue_sector).toBe('recepcao');
            expect(res.body.number).not.toMatch(/^AC/);
        }
    }));
});
