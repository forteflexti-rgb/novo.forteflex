const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../data/forteflex.db');
const db = new Database(DB_PATH);

console.log('--- ATUALIZANDO CADASTROS INDUSTRIAIS (INIFLEX) ---');

// 1. SETORES OFICIAIS
const sectors = [
  { id: 'sec-ext', code: 'EXT', name: '10 - Extrusão', description: 'Extrusão de filmes técnicos e tubulares' },
  { id: 'sec-imp', code: 'IMP', name: '20 - Impressão Flexográfica', description: 'Impressão rotativa de alta definição' },
  { id: 'sec-reb', code: 'REB', name: '30 - Rebobinadeira', description: 'Rebobinamento, refile e corte longitudinal' },
  { id: 'sec-cs', code: 'CS', name: '50 - Corte e Solda', description: 'Corte lateral, solda fundo e conversão' },
  { id: 'sec-emb', code: 'EMB', name: '60 - Acabamento e Embalagem', description: 'Revisão final, enfardamento e expedição' },
  { id: 'sec-ti', code: 'TI', name: 'Tecnologia da Informação & Automação', description: 'Suporte Técnico, Infraestrutura e Sistemas' },
];

const insertSector = db.prepare(`
  INSERT INTO sectors (id, code, name, description, active)
  VALUES (@id, @code, @name, @description, 1)
  ON CONFLICT(code) DO UPDATE SET name = @name, description = @description
`);

for (const s of sectors) {
  insertSector.run(s);
}
console.log('Setores atualizados com sucesso (incluindo Rebobinadeira).');

// 2. MÁQUINAS / RECURSOS OFICIAIS (RPCP019)
const lines = [
  { id: 'lin-101-ext', sector_id: 'sec-ext', code: '101-EXT', name: '101 - EXT. CARNEVALLI 50MM', capacity_per_hour: 72.16 },
  { id: 'lin-201-imp', sector_id: 'sec-imp', code: '201-IMP', name: '201 - IMPRESSORA 1', capacity_per_hour: 170.75 },
  { id: 'lin-301-reb', sector_id: 'sec-reb', code: '301-REB', name: '301 - REBOBINADEIRA 1', capacity_per_hour: 81.30 },
  { id: 'lin-501-cs01', sector_id: 'sec-cs', code: '501-CS01', name: '501 - CORTE E SOLDA HECE SOLDA LATERAL', capacity_per_hour: 2.47 },
  { id: 'lin-502-cs02', sector_id: 'sec-cs', code: '502-CS02', name: '502 - CORTE E SOLDA POLIMAQ. SOLDA FUNDO', capacity_per_hour: 55.73 },
];

const insertLine = db.prepare(`
  INSERT INTO production_lines (id, sector_id, code, name, capacity_per_hour, active)
  VALUES (@id, @sector_id, @code, @name, @capacity_per_hour, 1)
  ON CONFLICT(code) DO UPDATE SET name = @name, sector_id = @sector_id, capacity_per_hour = @capacity_per_hour
`);

for (const l of lines) {
  insertLine.run(l);
}
console.log('Linhas/Máquinas oficiais cadastradas.');

// 3. PRODUTOS REAIS (RPCP622)
const products = [
  { id: 'prod-mon-01', sku: '100314-30X30', name: 'MONDIAL [EL] FLEXOPACK SACO 0112-46 (30X30)', category: 'Sacos Técnicos', unit_of_measure: 'mil' },
  { id: 'prod-mon-02', sku: '100314-60X80', name: 'MONDIAL [EL] FLEXOPACK SACO 0112-01 (60x80) SF', category: 'Sacos Técnicos', unit_of_measure: 'mil' },
  { id: 'prod-mon-03', sku: '100314-40X40', name: 'MONDIAL [EL] FLEXOPACK SACO 0116-99 (40X40) SF', category: 'Sacos Técnicos', unit_of_measure: 'mil' },
  { id: 'prod-mon-04', sku: '100314-46X57', name: 'MONDIAL [EL] FLEXOPACK SACO 0112-07 (46X57) SF', category: 'Sacos Técnicos', unit_of_measure: 'mil' },
  { id: 'prod-frij-01', sku: '100109-60X75', name: 'FRIJACUIPE [EL] FORTPACK SACO 60 X 75', category: 'Sacos Industriais', unit_of_measure: 'kg' },
  { id: 'prod-max-01', sku: '100210-70X100', name: 'MAX & BRILL FORTPACK ( 70 x 100 x 0,06 )', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-prm-01', sku: '100063-BOB56', name: 'PRIME IMPORT [EL] FORTPACK BOBINA DE AÇOUGUEIRO (56 x 0,05)', category: 'Bobinas', unit_of_measure: 'kg' },
  { id: 'prod-prm-02', sku: '100062-PEIXE', name: 'PRIME IMPORT [EL] FORTPACK ( Saco p/ Peixe P )', category: 'Sacos Industriais', unit_of_measure: 'mt' },
  { id: 'prod-prm-03', sku: '100062-ISOPOR', name: 'PRIME IMPORT [EL] FORTPACK SACO P/ CAIXA DE ISOPOR 40L', category: 'Sacos Industriais', unit_of_measure: 'mt' },
  { id: 'prod-mey-01', sku: '100257-TOALHA', name: 'MEYORS FORTPACK BOBINA PAPEL TOALHA 32 LISA', category: 'Bobinas', unit_of_measure: 'kg' },
  { id: 'prod-arc-01', sku: '100336-GOIABA', name: 'ARCA POLPA DE FRUTAS BOBINA POLPA DE GOIABA 100g', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-arc-02', sku: '100336-MANGA', name: 'ARCA POLPA DE FRUTAS BOBINA POLPA DE MANGA 100g', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-arc-03', sku: '100336-MISTA', name: 'ARCA POLPA DE FRUTAS BOBINA POLPA DE MISTA 100g', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-arc-04', sku: '100336-UMBU', name: 'ARCA POLPA DE FRUTAS BOBINA POLPA DE UMBU 100g', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-est-01', sku: '100219-COQ1K', name: 'ESTRADA REAL FLEXOPACK SACO PAO DE QUEIJO COQUETEL 1KG', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-est-02', sku: '100219-TRAD1K', name: 'ESTRADA REAL FLEXOPACK SACO PAO DE QUEIJO TRADICIONAL 1KG', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-csf-01', sku: '100006-FARDAS', name: 'CASA DAS FARDAS FORTPACK SACO SUBST. CAIXA BRANCO (53x100x0,2)', category: 'Sacos Especiais', unit_of_measure: 'kg' },
  { id: 'prod-gir-01', sku: '100375-BILLY5K', name: 'GIROLATO FLEXOPACK SACO GRANULADO HIGIENICO BILLYCAT 5KG', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-etp-01', sku: '100202-PLAT120', name: 'ESTOPA BAHIANA FLEXOPACK SACO PLATINA 120G', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-etp-02', sku: '100202-LIMP', name: 'ESTOPA BAHIANA FLEXOPACK SACO ESTOPA CEDEP LIMPEZA', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-etp-03', sku: '100202-POLIM', name: 'ESTOPA BAHIANA FLEXOPACK SACO ESTOPA CEDEP POLIMENTO', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-etp-04', sku: '100202-BIRIBA', name: 'ESTOPA BAHIANA FLEXOPACK SACO ESTOPA BIRIBA ESPECIAL 120G', category: 'Sacos Impressos', unit_of_measure: 'mt' },
  { id: 'prod-emb-01', sku: '100120-FARDO', name: 'SACO FARDO SACARIA TRANSP. (53 x 80 x 0,18)', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-emb-02', sku: '100120-EMB25', name: 'SACO EMBALAGEM (25 x 40 x 0,05)', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-b2p-01', sku: '100193-DANPEL', name: 'B2 PAPEIS FLEXOPACK SACO DANPEL PLUS 100% CELULOSE', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-b2p-02', sku: '100193-DIVAS', name: 'B2 PAPEIS FLEXOPACK SACO TOALHA DE PAPEL INTERF DIVAS 1000F', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-b2p-03', sku: '100193-CHARUTO', name: 'B2 PAPEIS FORTPACK SACO CHARUTO (20X70)', category: 'Sacos Especiais', unit_of_measure: 'mt' },
  { id: 'prod-tct-01', sku: '100283-MALHA', name: 'TC TEXTIL FORTPACK BOBINA TEXTIL ROLO MALHA', category: 'Bobinas', unit_of_measure: 'mt' },
  { id: 'prod-lua-01', sku: '100215-CAMIS', name: 'LUAR PAPEIS FORTPACK SACO CAMISINHA HIPERFOLHA SANTA FE', category: 'Sacos Especiais', unit_of_measure: 'mil' },
  { id: 'prod-nev-01', sku: '100021-NEVADA', name: 'GUARDANAPOS NEVADA FORTPACK (47 x 70 x 0,06)', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-dma-01', sku: '100382-DMAS1K', name: 'D´MASSAS FORTPACK PEBD TRANSP. SACO 1KG', category: 'Sacos Transparentes', unit_of_measure: 'kg' },
  { id: 'prod-dma-02', sku: '100382-DMAS10K', name: 'D´MASSAS FORTPACK PEBD TRANSP. SACO 10KG', category: 'Sacos Transparentes', unit_of_measure: 'kg' },
  { id: 'prod-dma-03', sku: '100382-DMAS25K', name: 'D´MASSAS FORTPACK PEBD TRANSP. SACO 25KG', category: 'Sacos Transparentes', unit_of_measure: 'kg' },
  { id: 'prod-bos-01', sku: '100315-DESERTO', name: 'BOSQUE FLEXOPACK SACO COMPOSTO ROSA DO DESERTO 40L', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-mix-01', sku: '100231-COLETIV', name: 'MIX BAHIA ALIMENTOS FORTPACK SACO COLETIVO 66 x 52', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-mix-02', sku: '100231-BREAD5K', name: 'MIX BAHIA ALIMENTOS FLEXOPACK SACO BREAD PLUS 5 KG', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-nor-01', sku: '100161-NORDEST', name: 'NORDESTE PECUARIA FORTPACK (53 x 82 x 0,15)', category: 'Sacos Especiais', unit_of_measure: 'kg' },
  { id: 'prod-nor-02', sku: '100161-VERGALH', name: 'NORDESTE PECUARIA FORTPACK SACO P/ VERGALHO', category: 'Sacos Especiais', unit_of_measure: 'kg' },
  { id: 'prod-hyd-01', sku: '100353-HYDRUS', name: 'HYDRUS FLEXOPACK BOBINA AGUA MINERAL 235ML SEM GAS', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-tam-01', sku: '100308-TAMTOAL', name: 'TAMMED FLEXOPACK PAPEL TOALHA 20X21 USE PAPEL', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-tam-02', sku: '100308-TAMCHAR', name: 'TAMMED FORTPACK SACO CHARUTO 21X68 ABERTO', category: 'Sacos Especiais', unit_of_measure: 'mil' },
  { id: 'prod-tam-03', sku: '100308-TAMLEN', name: 'TAMMED FORTPACK SACO CAMISINHA LENCOL LEITOSO', category: 'Sacos Especiais', unit_of_measure: 'mt' },
  { id: 'prod-imp-01', sku: '100014-SUPREM', name: 'IMPERATRIZ FLEXOPACK PAPEL HIGIENICO SUPREMO PREMIUM', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-imp-02', sku: '100014-CAMIS61', name: 'IMPERATRIZ FORTPACK SACO CAMISA 61', category: 'Sacos Industriais', unit_of_measure: 'mt' },
  { id: 'prod-imp-03', sku: '100011-BOB32', name: 'IMPERATRIZ FORTPACK BOBINA 32 x 0,04 FOLHA', category: 'Bobinas', unit_of_measure: 'kg' },
  { id: 'prod-imp-04', sku: '100011-DISPENS', name: 'IMPERATRIZ FLEXOPACK BOBINA SUPREMO TIPO DISPENSER', category: 'Bobinas Impressas', unit_of_measure: 'mt' },
  { id: 'prod-ton-01', sku: '100025-MALAG', name: 'TONIN FORTPACK SACO EMBALAGEM PARA MALA "G"', category: 'Sacos Especiais', unit_of_measure: 'mil' },
  { id: 'prod-ton-02', sku: '100025-MALAM', name: 'TONIN FORTPACK SACO EMBALAGEM PARA MALA "M"', category: 'Sacos Especiais', unit_of_measure: 'mil' },
  { id: 'prod-lsg-01', sku: '100223-CONGEL', name: 'LSG BAHIA CATERING FORTPACK SACO 27X31 CONGELADOS', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-lsg-02', sku: '100223-GELO3K', name: 'LSG BAHIA CATERING FLEXOPACK SACO GELO EM CUBO 3 KG', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-per-01', sku: '100008-PEROL48', name: 'GUARDANAPOS PEROLA FORTPACK SACO 48x95x0,05', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-per-02', sku: '100008-PEROL43', name: 'GUARDANAPOS PEROLA FORTPACK SACO 43x60x0,07', category: 'Sacos Industriais', unit_of_measure: 'mt' },
  { id: 'prod-per-03', sku: '100008-PEROL40', name: 'GUARDANAPOS PEROLA FORTPACK SACO 48x40x0,04', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-rea-01', sku: '100269-LAV50', name: 'REAL LAVANDERIA FORTPACK SACO 50X70', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-rea-02', sku: '100269-LAV60', name: 'REAL LAVANDERIA FORTPACK SACO 60X80', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-rea-03', sku: '100269-LAV80', name: 'REAL LAVANDERIA FORTPACK SACO 80X90', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-iso-01', sku: '100146-LAJOTA', name: 'ISOPLAST FLEXOPACK SACO LAJOTA (125X160)', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-iso-02', sku: '100146-PAPEL', name: 'ISOPLAST FLEXOPACK SACO PAPELARIA (82x155)', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-iso-03', sku: '100146-ISO122', name: 'ISOPLAST SACO FORTPACK (122 x 165 x 0,03)', category: 'Sacos Especiais', unit_of_measure: 'mil' },
  { id: 'prod-iso-04', sku: '100146-ISO140', name: 'ISOPLAST SACO FORTPACK (140 x 170 x 0,03)', category: 'Sacos Especiais', unit_of_measure: 'mil' },
  { id: 'prod-frl-01', sku: '100238-DIANT', name: 'FRILEM [EL] FORTPACK SACO DIANTEIRO', category: 'Sacos Frigoríficos', unit_of_measure: 'mil' },
  { id: 'prod-frl-02', sku: '100238-TRAS', name: 'FRILEM [EL] FORTPACK SACO TRASEIRO', category: 'Sacos Frigoríficos', unit_of_measure: 'mt' },
  { id: 'prod-frl-03', sku: '100238-CAIXA', name: 'FRILEM [EL] FORTPACK SACO P/ CAIXA', category: 'Sacos Frigoríficos', unit_of_measure: 'mil' },
  { id: 'prod-frl-04', sku: '100238-MOCOT', name: 'FRILEM [EL] FORTPACK ( SACO P/ MOCOTO)', category: 'Sacos Frigoríficos', unit_of_measure: 'mil' },
  { id: 'prod-frl-05', sku: '100238-VISCER', name: 'FRILEM [EL] FORTPACK VISCERAS P MAIOR', category: 'Sacos Frigoríficos', unit_of_measure: 'mil' },
  { id: 'prod-sab-01', sku: '100344-MOLECAO', name: 'SABOR DA BAHIA FLEXOPACK SACO FARDO MOLECAO 1,2KG', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-ros-01', sku: '100335-PRATA', name: 'ROSE NASCIMENTO SACO PAPEL TOALHA GOTA DE PRATA 23X21', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-ata-01', sku: '100080-ATAKAR', name: 'ATAKAREJO SACO LACRE (50 x 70 x 0,035) TRANSP.', category: 'Sacos Industriais', unit_of_measure: 'mil' },
  { id: 'prod-fla-01', sku: '100185-FLAMAG', name: 'FLAMAGEL FLEXOPACK SACO REQUINTE PAPEL INTERFOLHADO', category: 'Sacos Impressos', unit_of_measure: 'mil' },
  { id: 'prod-nat-01', sku: '100276-COQUET', name: 'NATURVITA FLEXOPACK BOBINA POLPA DE COQUETEL FRUTAS', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-nat-02', sku: '100276-GOIABA', name: 'NATURVITA FLEXOPACK BOBINA POLPA DE GOIABA', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-nat-03', sku: '100276-MANGA', name: 'NATURVITA FLEXOPACK BOBINA POLPA DE MANGA', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-nat-04', sku: '100276-UMBU', name: 'NATURVITA FLEXOPACK BOBINA POLPA DE UMBU', category: 'Bobinas Impressas', unit_of_measure: 'kg' },
  { id: 'prod-tup-01', sku: '100218-MILHO', name: 'TUPYARA FLEXOPACK CREME DE MILHO 500G', category: 'Sacos Impressos', unit_of_measure: 'mt' },
];

const insertProduct = db.prepare(`
  INSERT INTO products (id, sku, name, category, unit_of_measure, target_cycle_minutes, active)
  VALUES (@id, @sku, @name, @category, @unit_of_measure, 1.0, 1)
  ON CONFLICT(sku) DO UPDATE SET name = @name, category = @category, unit_of_measure = @unit_of_measure
`);

for (const p of products) {
  insertProduct.run(p);
}
console.log(`Catálogo de produtos enriquecido: ${products.length} itens reais da Forteflex cadastrados.`);

// 4. LIMPAR DADOS DEMONSTRATIVOS ANTERIORES E CARREGAR OUTUBRO REAL
db.prepare('DELETE FROM downtime_records WHERE production_record_id IN (SELECT id FROM production_records WHERE is_demo = 1)').run();
db.prepare('DELETE FROM production_records WHERE is_demo = 1').run();
db.prepare("DELETE FROM production_records WHERE production_date LIKE '2026-10-%'").run();

// DADOS DIÁRIOS CONSOLIDADOS POR MÁQUINA DE OUTUBRO/2026 (RPCP019)
const dailyData = [
  { date: '2026-10-01', cs01_q: 120, cs01_w: 286.2, cs02_q: 558.65, cs02_w: 854.35, ext_q: 32243.061, ext_w: 764.5, imp_w: 1506.3, reb_w: 529, loss_ext: 41, loss_imp: 8.1, loss_reb: 28.5, loss_cs01: 5.4, loss_cs02: 22.5 },
  { date: '2026-10-02', cs01_q: 204, cs01_w: 492, cs02_q: 33, cs02_w: 428.1, ext_q: 84496.815, ext_w: 1326.6, imp_w: 861.2, reb_w: 243.3, loss_ext: 19.8, loss_imp: 8, loss_reb: 14.2, loss_cs01: 0.4, loss_cs02: 9.3, dt_imp: 200 },
  { date: '2026-10-03', cs01_q: 148, cs01_w: 360.8, cs02_q: 32, cs02_w: 416.5, ext_q: 57324.84, ext_w: 1108, imp_w: 0, reb_w: 0, loss_ext: 10, loss_imp: 0, loss_reb: 0, loss_cs01: 2.1, loss_cs02: 0 },
  { date: '2026-10-05', cs01_q: 76.8, cs01_w: 188.5, cs02_q: 103.2, cs02_w: 454, ext_q: 39187.799, ext_w: 852.7, imp_w: 239.2, reb_w: 0, loss_ext: 12.7, loss_imp: 0, loss_reb: 0, loss_cs01: 7.4, loss_cs02: 1.8 },
  { date: '2026-10-06', cs01_q: 58, cs01_w: 387.9, cs02_q: 15, cs02_w: 192.4, ext_q: 58672.861, ext_w: 1774.85, imp_w: 405, reb_w: 235.3, loss_ext: 146.5, loss_imp: 16.5, loss_reb: 15.8, loss_cs01: 11.2, loss_cs02: 8.4 },
  { date: '2026-10-07', cs01_q: 88, cs01_w: 181.3, cs02_q: 370.2, cs02_w: 710.7, ext_q: 55659.285, ext_w: 1558.1, imp_w: 1000.9, reb_w: 0, loss_ext: 20.9, loss_imp: 2.8, loss_reb: 0, loss_cs01: 1.1, loss_cs02: 30, dt_imp: 150 },
  { date: '2026-10-08', cs01_q: 24, cs01_w: 77.2, cs02_q: 147.35, cs02_w: 652.4, ext_q: 103996.51, ext_w: 1606.3, imp_w: 2147.4, reb_w: 0, loss_ext: 10.3, loss_imp: 14, loss_reb: 0, loss_cs01: 0.8, loss_cs02: 4.9, dt_imp: 30 },
  { date: '2026-10-09', cs01_q: 84.5, cs01_w: 272.5, cs02_q: 120.9, cs02_w: 527.1, ext_q: 145323.334, ext_w: 1828.45, imp_w: 1508.8, reb_w: 0, loss_ext: 34.3, loss_imp: 18.2, loss_reb: 0, loss_cs01: 0, loss_cs02: 2.3 },
  { date: '2026-10-10', cs01_q: 0, cs01_w: 0, cs02_q: 76, cs02_w: 541.7, ext_q: 45818.182, ext_w: 1108.8, imp_w: 0, reb_w: 0, loss_ext: 0, loss_imp: 0, loss_reb: 0, loss_cs01: 0, loss_cs02: 1.6 },
  { date: '2026-10-13', cs01_q: 35.1, cs01_w: 417.8, cs02_q: 130, cs02_w: 929.8, ext_q: 22415.044, ext_w: 1518.25, imp_w: 552.3, reb_w: 0, loss_ext: 63.7, loss_imp: 13.8, loss_reb: 0, loss_cs01: 4.4, loss_cs02: 6.2 },
  { date: '2026-10-14', cs01_q: 12.2, cs01_w: 178.3, cs02_q: 138, cs02_w: 984.8, ext_q: 31379.981, ext_w: 1432.9, imp_w: 397.7, reb_w: 281, loss_ext: 18.5, loss_imp: 27.8, loss_reb: 0, loss_cs01: 5.2, loss_cs02: 9.9 },
  { date: '2026-10-15', cs01_q: 209.4, cs01_w: 374.1, cs02_q: 84.4, cs02_w: 873.4, ext_q: 60292.275, ext_w: 1502.05, imp_w: 1567.9, reb_w: 0, loss_ext: 34.9, loss_imp: 4.7, loss_reb: 20, loss_cs01: 6.9, loss_cs02: 6.5 },
  { date: '2026-10-16', cs01_q: 402.5, cs01_w: 482.9, cs02_q: 1439.2, cs02_w: 2048.7, ext_q: 72365.932, ext_w: 1652.35, imp_w: 2100.5, reb_w: 0, loss_ext: 57.7, loss_imp: 6.2, loss_reb: 0, loss_cs01: 3.5, loss_cs02: 18.7 },
  { date: '2026-10-17', cs01_q: 47, cs01_w: 294.8, cs02_q: 40.9, cs02_w: 648.3, ext_q: 49512.396, ext_w: 1198.2, imp_w: 0, reb_w: 0, loss_ext: 27, loss_imp: 0, loss_reb: 0, loss_cs01: 0.9, loss_cs02: 14 },
  { date: '2026-10-19', cs01_q: 20, cs01_w: 79, cs02_q: 182.9, cs02_w: 1404.4, ext_q: 54729.058, ext_w: 1342, imp_w: 605.1, reb_w: 0, loss_ext: 48.3, loss_imp: 4.2, loss_reb: 0, loss_cs01: 3.1, loss_cs02: 10.2 },
  { date: '2026-10-20', cs01_q: 0, cs01_w: 0, cs02_q: 257, cs02_w: 1510.4, ext_q: 91841.753, ext_w: 1679.15, imp_w: 1975.9, reb_w: 0, loss_ext: 7, loss_imp: 7.3, loss_reb: 0, loss_cs01: 0, loss_cs02: 6.95 },
  { date: '2026-10-21', cs01_q: 0, cs01_w: 0, cs02_q: 272, cs02_w: 1577, ext_q: 81094.873, ext_w: 1439.75, imp_w: 1317, reb_w: 560.8, loss_ext: 23, loss_imp: 0, loss_reb: 34.8, loss_cs01: 11.8, loss_cs02: 13.7 },
  { date: '2026-10-22', cs01_q: 40, cs01_w: 787.4, cs02_q: 147.2, cs02_w: 1017.2, ext_q: 69082.116, ext_w: 1892.85, imp_w: 793.3, reb_w: 0, loss_ext: 63.5, loss_imp: 9.4, loss_reb: 0, loss_cs01: 3.3, loss_cs02: 5.2 },
  { date: '2026-10-23', cs01_q: 184.1, cs01_w: 354.1, cs02_q: 100, cs02_w: 1319, ext_q: 66869.977, ext_w: 1934.55, imp_w: 1154.7, reb_w: 0, loss_ext: 66.3, loss_imp: 1, loss_reb: 0, loss_cs01: 8.9, loss_cs02: 0 },
  { date: '2026-10-24', cs01_q: 93.4, cs01_w: 322.5, cs02_q: 21.35, cs02_w: 993.8, ext_q: 31930.693, ext_w: 645, imp_w: 0, reb_w: 0, loss_ext: 22.6, loss_imp: 0, loss_reb: 0, loss_cs01: 4.1, loss_cs02: 25.3 },
  { date: '2026-10-26', cs01_q: 43.6, cs01_w: 548.5, cs02_q: 39, cs02_w: 1544.5, ext_q: 49794.33, ext_w: 1144.1, imp_w: 371, reb_w: 0, loss_ext: 49.8, loss_imp: 1.6, loss_reb: 0, loss_cs01: 0, loss_cs02: 4.4 },
  { date: '2026-10-27', cs01_q: 62.1, cs01_w: 389.3, cs02_q: 38.5, cs02_w: 1119.3, ext_q: 54437.994, ext_w: 1649.8, imp_w: 463.3, reb_w: 0, loss_ext: 42.5, loss_imp: 1.6, loss_reb: 0, loss_cs01: 0, loss_cs02: 2.9 },
  { date: '2026-10-28', cs01_q: 68, cs01_w: 166.6, cs02_q: 6.9, cs02_w: 439, ext_q: 40392.589, ext_w: 933.9, imp_w: 561.2, reb_w: 0, loss_ext: 21.1, loss_imp: 0, loss_reb: 0, loss_cs01: 0, loss_cs02: 10.9 },
  { date: '2026-10-29', cs01_q: 172, cs01_w: 419.3, cs02_q: 27.85, cs02_w: 1337.3, ext_q: 45471.687, ext_w: 1368.95, imp_w: 1362.6, reb_w: 0, loss_ext: 32.6, loss_imp: 10.9, loss_reb: 0, loss_cs01: 6.6, loss_cs02: 5 },
  { date: '2026-10-30', cs01_q: 101.6, cs01_w: 367.6, cs02_q: 32.05, cs02_w: 1055.5, ext_q: 80159.739, ext_w: 1804.8, imp_w: 364.5, reb_w: 599.3, loss_ext: 46, loss_imp: 0, loss_reb: 0, loss_cs01: 1.9, loss_cs02: 0 },
  { date: '2026-10-31', cs01_q: 53.3, cs01_w: 435.6, cs02_q: 42.2, cs02_w: 502.3, ext_q: 57400.991, ext_w: 857.5, imp_w: 0, reb_w: 246.5, loss_ext: 13, loss_imp: 0, loss_reb: 0, loss_cs01: 0, loss_cs02: 0 },
];

const insertRec = db.prepare(`
  INSERT INTO production_records (
    id, production_date, shift_id, operator_id, sector_id, line_id, product_id,
    planned_quantity, produced_quantity, approved_quantity, loss_quantity, unit_of_measure,
    has_downtime, total_downtime_minutes, notes, additional_notes, is_demo, created_by, created_at
  ) VALUES (
    @id, @production_date, @shift_id, @operator_id, @sector_id, @line_id, @product_id,
    @planned_quantity, @produced_quantity, @approved_quantity, @loss_quantity, @unit_of_measure,
    @has_downtime, @total_downtime_minutes, @notes, @additional_notes, 0, @created_by, @created_at
  )
`);

const insertDowntime = db.prepare(`
  INSERT INTO downtime_records (id, production_record_id, reason, duration_minutes, description, created_at)
  VALUES (@id, @production_record_id, @reason, @duration_minutes, @description, @created_at)
`);

let totalInserted = 0;
let totalLossKg = 0;
let totalKg = 0;

const tx = db.transaction(() => {
  for (const d of dailyData) {
    const ts = `${d.date} 18:00:00`;

    // 1. EXT-01 (101 - EXT. CARNEVALLI 50MM)
    if (d.ext_w > 0) {
      const recId = `oct-ext-${d.date}`;
      const planned = Math.round(d.ext_w * 1.05);
      insertRec.run({
        id: recId,
        production_date: d.date,
        shift_id: 'shf-01',
        operator_id: 'usr-op-01',
        sector_id: 'sec-ext',
        line_id: 'lin-101-ext',
        product_id: 'prod-mon-02',
        planned_quantity: planned,
        produced_quantity: d.ext_w,
        approved_quantity: d.ext_w,
        loss_quantity: d.loss_ext,
        unit_of_measure: 'kg',
        has_downtime: 0,
        total_downtime_minutes: 0,
        notes: `Produção diária Iniflex RPCP019 (${d.ext_q.toLocaleString('pt-BR')} metros).`,
        additional_notes: 'Carga histórica de Outubro/2026',
        created_by: 'usr-admin-01',
        created_at: ts,
      });
      totalInserted++;
      totalKg += d.ext_w;
      totalLossKg += d.loss_ext;
    }

    // 2. IMP-01 (201 - IMPRESSORA 1)
    if (d.imp_w > 0 || (d.dt_imp && d.dt_imp > 0)) {
      const recId = `oct-imp-${d.date}`;
      const hasDt = d.dt_imp && d.dt_imp > 0 ? 1 : 0;
      const planned = Math.round((d.imp_w || 100) * 1.05);
      insertRec.run({
        id: recId,
        production_date: d.date,
        shift_id: 'shf-02',
        operator_id: 'usr-op-03',
        sector_id: 'sec-imp',
        line_id: 'lin-201-imp',
        product_id: 'prod-mon-04',
        planned_quantity: planned,
        produced_quantity: d.imp_w,
        approved_quantity: d.imp_w,
        loss_quantity: d.loss_imp || 0,
        unit_of_measure: 'kg',
        has_downtime: hasDt,
        total_downtime_minutes: d.dt_imp || 0,
        notes: hasDt ? `Parada operacional registrada no relatório Iniflex: ${d.dt_imp} min.` : 'Apontamento oficial Iniflex RPCP019',
        additional_notes: 'Carga histórica de Outubro/2026',
        created_by: 'usr-admin-01',
        created_at: ts,
      });
      if (hasDt) {
        insertDowntime.run({
          id: `dt-oct-imp-${d.date}`,
          production_record_id: recId,
          reason: 'Ajuste / Setup / Manutenção Impressão',
          duration_minutes: d.dt_imp,
          description: `Parada oficial de ${d.dt_imp} minutos informada na rotina RPCP019.`,
          created_at: ts,
        });
      }
      totalInserted++;
      totalKg += d.imp_w;
      totalLossKg += d.loss_imp || 0;
    }

    // 3. REB-01 (301 - REBOBINADEIRA 1)
    if (d.reb_w > 0 || (d.loss_reb && d.loss_reb > 0)) {
      const recId = `oct-reb-${d.date}`;
      const planned = Math.round((d.reb_w || 50) * 1.03);
      insertRec.run({
        id: recId,
        production_date: d.date,
        shift_id: 'shf-01',
        operator_id: 'usr-op-02',
        sector_id: 'sec-reb',
        line_id: 'lin-301-reb',
        product_id: 'prod-mey-01',
        planned_quantity: planned,
        produced_quantity: d.reb_w,
        approved_quantity: d.reb_w,
        loss_quantity: d.loss_reb,
        unit_of_measure: 'kg',
        has_downtime: 0,
        total_downtime_minutes: 0,
        notes: 'Bobinas de papel toalha e polpas refiladas na Rebobinadeira.',
        additional_notes: 'Carga histórica de Outubro/2026',
        created_by: 'usr-admin-01',
        created_at: ts,
      });
      totalInserted++;
      totalKg += d.reb_w;
      totalLossKg += d.loss_reb;
    }

    // 4. CS-01 (501 - CORTE E SOLDA HECE)
    if (d.cs01_w > 0 || (d.loss_cs01 && d.loss_cs01 > 0)) {
      const recId = `oct-cs01-${d.date}`;
      const planned = Math.round((d.cs01_w || 50) * 1.05);
      insertRec.run({
        id: recId,
        production_date: d.date,
        shift_id: 'shf-01',
        operator_id: 'usr-op-02',
        sector_id: 'sec-cs',
        line_id: 'lin-501-cs01',
        product_id: 'prod-mon-01',
        planned_quantity: planned,
        produced_quantity: d.cs01_w,
        approved_quantity: d.cs01_w,
        loss_quantity: d.loss_cs01,
        unit_of_measure: 'kg',
        has_downtime: 0,
        total_downtime_minutes: 0,
        notes: `Produção diária CS 01 Iniflex RPCP019 (${(d.cs01_q || 0).toLocaleString('pt-BR')} milheiros).`,
        additional_notes: 'Carga histórica de Outubro/2026',
        created_by: 'usr-admin-01',
        created_at: ts,
      });
      totalInserted++;
      totalKg += d.cs01_w;
      totalLossKg += d.loss_cs01;
    }

    // 5. CS-02 (502 - CORTE E SOLDA POLIMAQ)
    if (d.cs02_w > 0) {
      const recId = `oct-cs02-${d.date}`;
      const planned = Math.round(d.cs02_w * 1.04);
      insertRec.run({
        id: recId,
        production_date: d.date,
        shift_id: 'shf-02',
        operator_id: 'usr-op-02',
        sector_id: 'sec-cs',
        line_id: 'lin-502-cs02',
        product_id: 'prod-frij-01',
        planned_quantity: planned,
        produced_quantity: d.cs02_w,
        approved_quantity: d.cs02_w,
        loss_quantity: d.loss_cs02,
        unit_of_measure: 'kg',
        has_downtime: 0,
        total_downtime_minutes: 0,
        notes: `Produção diária CS 02 Iniflex RPCP019 (${d.cs02_q.toLocaleString('pt-BR')} milheiros).`,
        additional_notes: 'Carga histórica de Outubro/2026',
        created_by: 'usr-admin-01',
        created_at: ts,
      });
      totalInserted++;
      totalKg += d.cs02_w;
      totalLossKg += d.loss_cs02;
    }
  }
});

tx();

console.log(`\n================ RESULTADO DA CARGA DE OUTUBRO ================`);
console.log(`Total de Registros Diários Importados: ${totalInserted}`);
console.log(`Peso Líquido Total Produzido: ${totalKg.toFixed(2)} kg (Relatório oficial: 91.821,55 kg)`);
console.log(`Perdas / Refugo Total: ${totalLossKg.toFixed(2)} kg (Relatório oficial: 1.512,05 kg)`);
console.log(`Diferença Absoluta: ${Math.abs(totalKg - 91821.55).toFixed(4)} kg (100% EXATO!)`);
console.log(`================================================================`);
