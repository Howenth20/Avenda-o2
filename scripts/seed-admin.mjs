import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const { DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("Set DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env.local first.");
}
if (ADMIN_PASSWORD.length < 14) throw new Error("ADMIN_PASSWORD must contain at least 14 characters.");

const connectionStringDefinesSsl = /[?&](sslmode|sslcert|sslkey|sslrootcert)=/i.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 1,
  ...(process.env.DATABASE_SSL === "true" && !connectionStringDefinesSsl ? { ssl: { rejectUnauthorized: true } } : {}),
});
try {
  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM users");
  if (existing.rows[0].count > 0) {
    throw new Error("The database already has an account. Initial admin seeding only runs on an empty user table.");
  }
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'ADMIN')",
    [ADMIN_NAME.trim(), ADMIN_EMAIL.trim().toLowerCase(), passwordHash],
  );
  console.log(`Initial administrator created: ${ADMIN_EMAIL.trim().toLowerCase()}`);
} finally {
  await pool.end();
}
