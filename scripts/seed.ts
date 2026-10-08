import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export function runInitialMigrationAndSeed(dbPath = ':memory:') {
  console.log(`[SEED] Menginisialisasi database pada target: ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  const schemaPath = path.resolve(__dirname, '../migrations/0001_initial_schema.sql');
  const seedPath = path.resolve(__dirname, '../seed/seed_data.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  console.log('[SEED] Menjalankan migrasi skema 0001...');
  db.exec(schemaSql);

  console.log('[SEED] Memasukkan data awal (seed)...');
  db.exec(seedSql);

  const depotsCount = (db.prepare('SELECT COUNT(*) as count FROM depots').get() as { count: number }).count;
  const usersCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const questionsCount = (db.prepare('SELECT COUNT(*) as count FROM audit_questions').get() as { count: number }).count;
  const optionsCount = (db.prepare('SELECT COUNT(*) as count FROM answer_options').get() as { count: number }).count;

  console.log('[SEED] Selesai dengan sukses:');
  console.log(`  - Depo Gudang: ${depotsCount} (KRW, BRS, CRB)`);
  console.log(`  - Pengguna: ${usersCount}`);
  console.log(`  - Pertanyaan Standar: ${questionsCount}`);
  console.log(`  - Opsi Jawaban: ${optionsCount}`);

  return db;
}

// If executed directly
if (process.argv[1]?.endsWith('seed.ts')) {
  runInitialMigrationAndSeed();
}
