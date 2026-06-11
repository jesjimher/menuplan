// Recomprime las imágenes existentes en la BD al formato que usa el endpoint
// de subida (WebP, máx. 800px). Uso manual:
//   node scripts/recompress-images.mjs [ruta-bd]   (por defecto ./menuplan.db)
import Database from 'better-sqlite3';
import sharp from 'sharp';

const MAX_IMAGE_DIMENSION = 800;
const WEBP_QUALITY = 80;

const dbPath = process.argv[2] ?? './menuplan.db';
const db = new Database(dbPath);

const rows = db.prepare('SELECT id, name, image_data, LENGTH(image_data) AS size FROM recipes WHERE image_data IS NOT NULL').all();
const update = db.prepare('UPDATE recipes SET image_data = ?, image_type = ? WHERE id = ?');

let totalBefore = 0;
let totalAfter = 0;
for (const row of rows) {
	totalBefore += row.size;
	try {
		const processed = await sharp(row.image_data)
			.rotate()
			.resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: WEBP_QUALITY })
			.toBuffer();
		if (processed.length < row.size) {
			update.run(processed, 'image/webp', row.id);
			totalAfter += processed.length;
			console.log(`✓ #${row.id} ${row.name}: ${(row.size / 1024).toFixed(0)} KB → ${(processed.length / 1024).toFixed(0)} KB`);
		} else {
			totalAfter += row.size;
			console.log(`= #${row.id} ${row.name}: ya compacta (${(row.size / 1024).toFixed(0)} KB)`);
		}
	} catch (e) {
		totalAfter += row.size;
		console.error(`✗ #${row.id} ${row.name}: ${e.message}`);
	}
}

console.log(`\n${rows.length} imágenes: ${(totalBefore / 1024).toFixed(0)} KB → ${(totalAfter / 1024).toFixed(0)} KB`);
db.exec('VACUUM');
db.close();
