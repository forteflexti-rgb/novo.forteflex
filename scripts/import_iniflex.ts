/**
 * Importa relatórios Iniflex (RPCP622 + RPCP019) direto no banco local.
 *
 *   npx tsx scripts/import_iniflex.ts <rpcp622.xlsx> [rpcp019.xlsx] [--commit]
 *
 * Sem --commit roda apenas a prévia (nada é gravado).
 * O mesmo importador é usado pela tela Admin → Importação e Iniflex.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, initDatabase } from '../server/db.ts';
import { importIniflexReports, parseIniflexWorkbook } from '../server/iniflex.ts';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('Uso: npx tsx scripts/import_iniflex.ts <rpcp622.xlsx> [rpcp019.xlsx] [--commit]');
  process.exit(1);
}

initDatabase();
const admin = db.prepare("SELECT id FROM profiles WHERE role = 'admin' AND is_active = 1 ORDER BY created_at LIMIT 1").get() as
  | { id: string }
  | undefined;
if (!admin) throw new Error('Nenhum administrador ativo encontrado para registrar a importação.');

const reports = files.map((f) => parseIniflexWorkbook(fs.readFileSync(f), path.basename(f)));
const summary = importIniflexReports(reports, { commit, userId: admin.id });

console.log(JSON.stringify(summary, null, 2));
console.log(commit ? '\nImportação GRAVADA.' : '\nPrévia apenas — rode novamente com --commit para gravar.');
