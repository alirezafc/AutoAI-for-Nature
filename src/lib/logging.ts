/* Minimal structured logger. Every log line can carry a run/correlation id.
 * Never log secrets: this logger must only ever receive non-sensitive metadata. */

type Meta = Record<string, unknown> | undefined;

const QUIET = process.env.AUTOAI_QUIET === "1";

function fmt(level: string, msg: string, meta?: Meta): string {
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level}] ${msg}${metaStr}`;
}

export const logger = {
  info(msg: string, meta?: Meta): void {
    if (QUIET) return;
    console.log(fmt("INFO", msg, meta));
  },
  warn(msg: string, meta?: Meta): void {
    if (QUIET) return;
    console.warn(fmt("WARN", msg, meta));
  },
  error(msg: string, meta?: Meta): void {
    if (QUIET) return;
    console.error(fmt("ERROR", msg, meta));
  },
};

export function withRun(runId: string) {
  return {
    info: (msg: string, meta?: Meta) => logger.info(msg, { runId, ...meta }),
    warn: (msg: string, meta?: Meta) => logger.warn(msg, { runId, ...meta }),
    error: (msg: string, meta?: Meta) => logger.error(msg, { runId, ...meta }),
  };
}
