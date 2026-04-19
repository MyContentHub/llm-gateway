import fp from "fastify-plugin";
import fastifyCron from "fastify-cron";
import type { FastifyInstance } from "fastify";

async function auditCleanup(server: FastifyInstance) {
  const auditConfig = server.config.audit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (server.register as any)(fastifyCron, {
    jobs: [
      {
        name: "audit-cleanup",
        cronTime: auditConfig.cleanup_cron,
        runOnInit: true,
        onTick: async () => {
          try {
            const db = server.db;
            db.transaction(() => {
              db.prepare(
                `UPDATE audit_logs SET request_body = NULL, response_body = NULL WHERE timestamp < datetime('now', '-' || ? || ' days') AND (request_body IS NOT NULL OR response_body IS NOT NULL)`
              ).run(auditConfig.body_retention_days);

              db.prepare(
                `DELETE FROM audit_logs WHERE timestamp < datetime('now', '-' || ? || ' days')`
              ).run(auditConfig.retention_days);
            })();

            server.log.info("Audit cleanup completed");
          } catch (err) {
            server.log.error(err, "Audit cleanup failed");
          }
        },
      },
    ],
  });
}

export const auditCleanupPlugin = fp(auditCleanup, {
  name: "audit-cleanup",
  dependencies: ["db"],
});
