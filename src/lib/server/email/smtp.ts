import "server-only";
import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  secure: boolean;
  timeoutMs: number;
}

function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST;
  const username = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? username;

  if (!host) {
    throw new Error("SMTP_HOST is required to send email.");
  }
  if (!username) {
    throw new Error("SMTP_USER is required to send email.");
  }
  if (!password) {
    throw new Error("SMTP_PASS is required to send email.");
  }
  if (!from) {
    throw new Error("SMTP_FROM or SMTP_USER is required to send email.");
  }

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    username,
    password,
    from,
    secure: process.env.SMTP_SECURE === "false" ? false : true,
    timeoutMs: Number(process.env.SMTP_TIMEOUT_MS ?? 10_000),
  };
}

function getDomain() {
  return process.env.SMTP_EHLO_DOMAIN ?? "cryocord-parking.local";
}

function parseEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

function formatAddress(value: string) {
  const email = parseEmailAddress(value);
  const safeValue = escapeHeader(value);
  if (value.includes("<")) {
    return safeValue;
  }
  return `<${email}>`;
}

function escapeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeData(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function createMimeMessage(message: EmailMessage, from: string) {
  const boundary = `cryocord-${randomUUID()}`;
  const safeSubject = escapeHeader(message.subject);

  return [
    `From: ${formatAddress(message.from ?? from)}`,
    `To: ${formatAddress(message.to)}`,
    `Subject: ${safeSubject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@cryocord-parking.local>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset="utf-8"`,
    "Content-Transfer-Encoding: 8bit",
    "",
    escapeData(message.text),
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset="utf-8"`,
    "Content-Transfer-Encoding: 8bit",
    "",
    escapeData(message.html),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function isPositiveSmtpCode(line: string) {
  const code = Number(line.slice(0, 3));
  return code >= 200 && code < 400;
}

export function createSmtpEmailTransport(config: SmtpConfig = getSmtpConfig()): EmailTransport {
  return {
    async send(message) {
      const socket = config.secure
        ? tls.connect({ host: config.host, port: config.port, servername: config.host })
        : net.connect({ host: config.host, port: config.port });

      socket.setEncoding("utf8");
      socket.setTimeout(config.timeoutMs);

      let buffer = "";
      let pendingResolve: ((line: string) => void) | null = null;
      let pendingReject: ((error: Error) => void) | null = null;

      function cleanup() {
        socket.removeAllListeners();
        socket.end();
      }

      function readResponse() {
        return new Promise<string>((resolve, reject) => {
          pendingResolve = resolve;
          pendingReject = reject;
          flushResponse();
        });
      }

      function flushResponse() {
        if (!pendingResolve) {
          return;
        }

        const lines = buffer.split(/\r?\n/);
        const completeIndex = lines.findIndex((line) => /^\d{3} /.test(line));
        if (completeIndex === -1) {
          return;
        }

        const response = lines.slice(0, completeIndex + 1).join("\n");
        buffer = lines.slice(completeIndex + 1).join("\n");
        const resolve = pendingResolve;
        pendingResolve = null;
        pendingReject = null;
        resolve(response);
      }

      socket.on("data", (chunk) => {
        buffer += chunk;
        flushResponse();
      });

      socket.on("error", (error) => {
        pendingReject?.(error);
      });
      socket.on("timeout", () => {
        const error = new Error("SMTP connection timed out.");
        pendingReject?.(error);
        socket.destroy(error);
      });

      async function command(line: string, accepted = isPositiveSmtpCode) {
        socket.write(`${line}\r\n`);
        const response = await readResponse();
        if (!accepted(response)) {
          throw new Error(`SMTP command failed: ${response}`);
        }
        return response;
      }

      try {
        const greeting = await readResponse();
        if (!isPositiveSmtpCode(greeting)) {
          throw new Error(`SMTP connection failed: ${greeting}`);
        }

        await command(`EHLO ${getDomain()}`);
        await command(`AUTH PLAIN ${Buffer.from(`\0${config.username}\0${config.password}`).toString("base64")}`);
        await command(`MAIL FROM:${formatAddress(message.from ?? config.from)}`);
        await command(`RCPT TO:${formatAddress(message.to)}`);
        await command("DATA", (response) => response.startsWith("354"));
        socket.write(`${createMimeMessage(message, config.from)}\r\n.\r\n`);
        const dataResponse = await readResponse();
        if (!isPositiveSmtpCode(dataResponse)) {
          throw new Error(`SMTP DATA failed: ${dataResponse}`);
        }
        await command("QUIT");
      } finally {
        cleanup();
      }
    },
  };
}
