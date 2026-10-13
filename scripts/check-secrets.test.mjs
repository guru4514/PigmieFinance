import test from "node:test";
import assert from "node:assert/strict";
import {
  credentialFileCategories,
  secretCategories,
} from "./check-secrets.mjs";

test("blocks credential filenames across nested and Windows paths", () => {
  for (const file of [
    "pigmie-api/.env",
    "pigmie-api/.env.staging.local",
    "pigmie-api\\.env.production",
    "envs-old.txt",
    "secrets-backup.txt",
    "server.pem",
    "server.key",
    "id_ed25519",
  ])
    assert.deepEqual(credentialFileCategories(file), ["Credential file"]);
});

test("permits public certificates and examples without bypassing content checks", () => {
  for (const file of [
    ".env.example",
    ".env.sample",
    "supabase-ca.crt",
    "config.ts",
  ])
    assert.deepEqual(credentialFileCategories(file), []);
  assert.deepEqual(secretCategories(`sb_secret_${"a".repeat(32)}`), [
    "Supabase secret key",
  ]);
});

test("detects other provider token categories without emitting matches", () => {
  const synthetic = [
    ["ghp", "a".repeat(36)].join("_"),
    ["AK", "IA", "A".repeat(16)].join(""),
    ["sk", "live", "a".repeat(24)].join("_"),
  ].join("\n");
  assert.deepEqual(secretCategories(synthetic), [
    "AWS access key",
    "GitHub access token",
    "Stripe live secret key",
  ]);
});

test("detects privileged keys and literal encryption configuration", () => {
  const synthetic = `sb_secret_${"a".repeat(32)}\nPII_ENCRYPTION_KEY=${"1".repeat(64)}`;
  assert.deepEqual(secretCategories(synthetic), [
    "Encryption key",
    "Supabase secret key",
  ]);
});

test("permits documented placeholders and public keys", () => {
  const examples = [
    "postgresql://postgres:REPLACE_WITH_DB_PASSWORD@localhost/postgres",
    "postgresql://postgres:****@localhost/postgres",
    "sb_secret_dummy_12345",
    `sb_publishable_${"a".repeat(32)}`,
    "PII_ENCRYPTION_KEY=REPLACE_WITH_ENCRYPTION_KEY",
  ];
  assert.deepEqual(secretCategories(examples.join("\n")), []);
});

test("detects encoded embedded passwords without revealing them", () => {
  const uri = new URL("postgresql://postgres@localhost/postgres");
  uri.password = ["synthetic", "fixture", "only"].join("-");
  assert.deepEqual(secretCategories(uri.toString()), [
    "Database password in URL",
  ]);
});

test("detects privileged JWTs but permits ordinary public-role JWTs", () => {
  const jwt = (role) =>
    [
      Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({ role, ref: "SYNTHETIC_TEST_ONLY" }),
      ).toString("base64url"),
      "synthetic_fixture_signature_only",
    ].join(".");
  assert.deepEqual(secretCategories(jwt("service_role")), [
    "Legacy service-role JWT",
  ]);
  assert.deepEqual(secretCategories(jwt("anon")), []);
});

test("recognizes private key headers", () => {
  const header = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  assert.deepEqual(secretCategories(header), ["Private key"]);
});
