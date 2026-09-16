import fs from "node:fs";

const [id, email] = process.argv.slice(2);
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id ?? "",
  ) ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "")
) {
  console.error(
    "Usage: node scripts/prepare-admin.mjs SUPABASE_USER_UUID verified-email@example.com",
  );
  process.exit(1);
}
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
fs.mkdirSync("work", { recursive: true });
fs.writeFileSync(
  "work/admin-promotion.sql",
  `-- Apply only through a trusted database operator after identity and MFA verification.\nUPDATE users SET role='admin' WHERE id=${quote(id)} AND email=${quote(email)} AND status='active';\nSELECT id,email,role FROM users WHERE id=${quote(id)};\n`,
);
console.log(
  "Prepared work/admin-promotion.sql for trusted operator review. No database change performed.",
);
