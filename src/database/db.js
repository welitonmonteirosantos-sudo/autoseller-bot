const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW()");

    console.log(
      "PostgreSQL conectado:",
      result.rows[0].now
    );

    return true;
  } catch (error) {
    console.error(
      "Erro ao conectar ao PostgreSQL:",
      error
    );

    return false;
  }
}

module.exports = {
  pool,
  testConnection,
};
