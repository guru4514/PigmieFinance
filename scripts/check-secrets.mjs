import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Report categories only: never emit matching values, source lines or Git output.
export function credentialFileCategories(file) {
  const base = path.posix.basename(file.replaceAll("\\", "/"));
  const example = /^\.env\.(?:example|sample)$/i.test(base);
  if (
    (!example && /^\.env(?:\.|$)/i.test(base)) ||
    /^(?:envs|secrets).*\.txt$/i.test(base) ||
    /\.(?:pem|key)$/i.test(base) ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)(?:$|\.)/i.test(base)
  )
    return ["Credential file"];
  return [];
}

export function secretCategories(text) {
  const found = new Set();
  if (
    /\bgh[pousr]_[A-Za-z0-9_]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(
      text,
    )
  )
    found.add("GitHub access token");
  if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text)) found.add("AWS access key");
  if (/\bsk_live_[A-Za-z0-9]{24,}\b/.test(text))
    found.add("Stripe live secret key");
  if (/sb_secret_(?!dummy(?:_|\b))[A-Za-z0-9_-]{20,}/.test(text))
    found.add("Supabase secret key");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
    found.add("Private key");
  if (/\bPII_ENCRYPTION_KEY\s*[:=]\s*["']?[a-fA-F0-9]{64}\b/.test(text))
    found.add("Encryption key");
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/[^\s"'`<>]+/g)) {
    try {
      const password = decodeURIComponent(new URL(match[0]).password);
      if (
        password &&
        !/^(?:REPLACE_WITH_[A-Z_]+|YOUR[-_][A-Z_-]+|\*+|dummy(?:[-_].*)?)$/.test(
          password,
        )
      )
        found.add("Database password in URL");
    } catch {
      // Malformed examples cannot be parsed as connection credentials.
    }
  }
  for (const match of text.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16,}\b/g,
  )) {
    try {
      const claims = JSON.parse(
        Buffer.from(match[0].split(".")[1], "base64url"),
      );
      if (claims.role === "service_role") found.add("Legacy service-role JWT");
    } catch {
      // Other strings are not a recognizable privileged Supabase JWT.
    }
  }
  return [...found].sort();
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const staged = process.argv.includes("--staged");
    const git = (args) =>
      execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 50_000_000,
      });
    const root = git(["rev-parse", "--show-toplevel"]).trim();
    process.chdir(root);
    const files = git(
      staged
        ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
        : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    )
      .split("\0")
      .filter(Boolean);
    let scanned = 0;
    let blocked = 0;
    for (const file of new Set(files)) {
      let content;
      try {
        content = staged
          ? git(["show", `:${file}`])
          : readFileSync(file, "utf8");
      } catch {
        // Only working-copy deletions are expected; staged read errors fail closed.
        if (staged) throw new Error("Staged file inspection failed");
        try {
          git(["ls-files", "--deleted", "--error-unmatch", "--", file]);
        } catch {
          throw new Error("File inspection failed");
        }
        continue;
      }
      scanned++;
      const categories = [
        ...credentialFileCategories(file),
        ...secretCategories(content),
      ];
      if (categories.length) {
        blocked++;
        console.error(JSON.stringify({ file, categories }));
      }
    }
    console.log(
      JSON.stringify({
        scan: staged ? "Git index" : "working files",
        scanned,
        blocked,
      }),
    );
    if (blocked) process.exitCode = 1;
  } catch {
    console.error(
      "Secret inspection failed. No matching values or command output printed.",
    );
    process.exitCode = 1;
  }
}
