import {
  adicionar,
  listar,
  chamarProximo,
  chamarEspecifico,
  remover,
  limpar,
} from "../doctorCallQueue";

describe("doctorCallQueue", () => {
  it("adiciona e lista em ordem de chegada (FIFO)", () => {
    const doctorId = 1001;
    adicionar(doctorId, { ticketId: 1, ticketNumber: "C001", patientName: "Ana" });
    adicionar(doctorId, { ticketId: 2, ticketNumber: "C002", patientName: "Bruno" });

    const fila = listar(doctorId);
    expect(fila.map((e) => e.ticketNumber)).toEqual(["C001", "C002"]);
  });

  it("chamarProximo remove e retorna o primeiro da fila", () => {
    const doctorId = 1002;
    adicionar(doctorId, { ticketId: 3, ticketNumber: "C003", patientName: "Carla" });
    adicionar(doctorId, { ticketId: 4, ticketNumber: "C004", patientName: "Davi" });

    const chamado = chamarProximo(doctorId);
    expect(chamado?.ticketNumber).toBe("C003");
    expect(listar(doctorId).map((e) => e.ticketNumber)).toEqual(["C004"]);
  });

  it("chamarProximo retorna null quando a fila está vazia", () => {
    expect(chamarProximo(9999)).toBeNull();
  });

  it("chamarEspecifico remove um item fora de ordem", () => {
    const doctorId = 1003;
    adicionar(doctorId, { ticketId: 5, ticketNumber: "C005", patientName: "Elis" });
    const segunda = adicionar(doctorId, { ticketId: 6, ticketNumber: "C006", patientName: "Fabio" });
    adicionar(doctorId, { ticketId: 7, ticketNumber: "C007", patientName: "Gisele" });

    const chamado = chamarEspecifico(doctorId, segunda.id);
    expect(chamado?.ticketNumber).toBe("C006");
    expect(listar(doctorId).map((e) => e.ticketNumber)).toEqual(["C005", "C007"]);
  });

  it("remover tira um item específico sem chamar", () => {
    const doctorId = 1004;
    const entry = adicionar(doctorId, { ticketId: 8, ticketNumber: "C008", patientName: "Hugo" });
    expect(remover(doctorId, entry.id)).toBe(true);
    expect(listar(doctorId)).toEqual([]);
  });

  it("limpar esvazia a fila inteira", () => {
    const doctorId = 1005;
    adicionar(doctorId, { ticketId: 9, ticketNumber: "C009", patientName: "Iris" });
    limpar(doctorId);
    expect(listar(doctorId)).toEqual([]);
  });

  it("filas de médicos diferentes não se misturam", () => {
    adicionar(2001, { ticketId: 10, ticketNumber: "C010", patientName: "Joao" });
    adicionar(2002, { ticketId: 11, ticketNumber: "C011", patientName: "Karla" });
    expect(listar(2001).map((e) => e.ticketNumber)).toEqual(["C010"]);
    expect(listar(2002).map((e) => e.ticketNumber)).toEqual(["C011"]);
  });
});
