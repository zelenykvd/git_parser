import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function loginHandler(req: Request, res: Response) {
  const { username, password } = req.body;
  if (
    username === config.auth.adminUsername &&
    password === config.auth.adminPassword
  ) {
    const token = jwt.sign({ sub: username }, config.auth.jwtSecret, {
      expiresIn: "7d",
    });
    return res.json({ token });
  }
  res.status(401).json({ error: "Invalid credentials" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token =
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ||
    (req.query.token as string | undefined);

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    jwt.verify(token, config.auth.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
