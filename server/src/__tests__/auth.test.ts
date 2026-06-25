import jwt from "jsonwebtoken";
import { generateToken, requireMedico, AuthRequest } from "../middleware/auth";

describe("auth middleware - medico", () => {
  it("generateToken inclui doctor_id quando presente", () => {
    const token = generateToken({
      id: 1,
      username: "medico1",
      role: "medico",
      doctor_id: 42,
    });
    const decoded = jwt.decode(token) as any;
    expect(decoded.doctor_id).toBe(42);
  });

  it("generateToken omite doctor_id quando ausente", () => {
    const token = generateToken({ id: 2, username: "atendente1", role: "attendant" });
    const decoded = jwt.decode(token) as any;
    expect(decoded.doctor_id).toBeUndefined();
  });

  it("requireMedico bloqueia quem não é medico", () => {
    const req = { user: { id: 1, username: "x", role: "attendant" } } as AuthRequest;
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) } as any;
    const next = jest.fn();

    requireMedico(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireMedico bloqueia medico sem doctor_id", () => {
    const req = { user: { id: 1, username: "x", role: "medico" } } as AuthRequest;
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) } as any;
    const next = jest.fn();

    requireMedico(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireMedico libera medico com doctor_id", () => {
    const req = { user: { id: 1, username: "x", role: "medico", doctor_id: 42 } } as AuthRequest;
    const res = {} as any;
    const next = jest.fn();

    requireMedico(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
