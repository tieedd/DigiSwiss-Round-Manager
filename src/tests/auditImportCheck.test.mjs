import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function getAllSourceFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') {
        getAllSourceFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

test('Integritas Audit: setiap file yang memanggil recordAuditLog( wajib memiliki import recordAuditLog', () => {
  const srcDir = path.resolve(process.cwd(), 'src');
  const files = getAllSourceFiles(srcDir);
  assert.ok(files.length > 0, 'Harus menemukan file sumber di direktori src');

  const filesCallingAuditLog = [];
  const missingImports = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(srcDir, filePath);

    // Periksa apakah memanggil fungsi recordAuditLog(
    if (content.includes('recordAuditLog(')) {
      filesCallingAuditLog.push(relativePath);

      // Kecualikan authService.ts karena file tersebut yang mendeklarasikan fungsi recordAuditLog
      if (relativePath.replace(/\\/g, '/') === 'services/authService.ts') {
        continue;
      }

      // Periksa keberadaan import recordAuditLog
      const hasImport =
        /import\s+[^;]*\brecordAuditLog\b[^;]*from/s.test(content) ||
        content.includes('recordAuditLog') && content.includes("from './authService'") ||
        content.includes('recordAuditLog') && content.includes("from '../services/authService'") ||
        content.includes('recordAuditLog') && content.includes("from '../../services/authService'");

      if (!hasImport) {
        missingImports.push(relativePath);
      }
    }
  }

  assert.ok(
    filesCallingAuditLog.length >= 4,
    `Harus ada setidaknya 4 file yang memanggil recordAuditLog, ditemukan: ${filesCallingAuditLog.length}`
  );

  assert.deepEqual(
    missingImports,
    [],
    `File berikut memanggil recordAuditLog( tetapi tidak mengimpor recordAuditLog: ${missingImports.join(', ')}`
  );
});
