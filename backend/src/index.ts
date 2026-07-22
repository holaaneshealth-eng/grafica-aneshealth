import path from "path";
import fs from "fs";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { migrate } from "./db";
import { seedUsers, resetAdminIfRequested } from "./seed";
import { startRetentionJob } from "./retention";
import { globalLimiter, notFound, errorHandler } from "./middleware";
import { authRouter } from "./routes/auth.routes";
import { casesRouter } from "./routes/cases.routes";
import { usersRouter } from "./routes/users.routes";
import { auditRouter } from "./routes/audit.routes";

// Red de seguridad: registrar (no matar el proceso) ante promesas rechazadas sin capturar.
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[proc] unhandledRejection (ignorado para mantener el servicio vivo):", reason);
});

async function main(): Promise<void> {
  await migrate();
  await seedUsers();
  await resetAdminIfRequested();
  startRetentionJob();

  const app = express();

  // Detras de proxy (Render/Fly/Nginx): habilita secure cookies e IP real.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Cabeceras de seguridad. CSP estricta; el frontend es same-origin.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // estilos inline de la SPA
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );

  if (config.corsOrigin) {
    app.use(cors({ origin: config.corsOrigin.split(","), credentials: true }));
  }

  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(globalLimiter);

  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use("/api/auth", authRouter);
  app.use("/api/cases", casesRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api", notFound);

  // Servir el frontend compilado (SPA) desde el mismo origen.
  const clientDir = path.resolve(__dirname, "../../frontend/dist");
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[server] No se encontro el frontend compilado en ${clientDir}. Ejecuta el build del frontend.`);
  }

  app.use(errorHandler);

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] AnesHealth backend escuchando en :${config.port} (prod=${config.isProd})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[fatal]", err);
  process.exit(1);
});
