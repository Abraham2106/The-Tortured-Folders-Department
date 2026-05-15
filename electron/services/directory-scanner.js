import fs from 'fs/promises';
import path from 'path';
import * as transactionsService from '../database/transactions.js';

export const analyzeFilePatterns = (filenames) => {
  const datePattern = /^(.+?)[\s_-](\d{4})[-_](\d{2})[-_](\d{2})/;
  const numberedPattern = /^(.+?)\s*\((\d+)\)(\.\w+)?$/;

  const byDatePrefix = {};
  const numbered = [];
  const other = [];

  for (const name of filenames) {
    const dateMatch = name.match(datePattern);
    if (dateMatch) {
      const [, prefix, year, month] = dateMatch;
      const key = prefix.trim();
      if (!byDatePrefix[key]) byDatePrefix[key] = {};
      if (!byDatePrefix[key][year]) byDatePrefix[key][year] = new Set();
      byDatePrefix[key][year].add(month);
      continue;
    }

    const numMatch = name.match(numberedPattern);
    if (numMatch) {
      numbered.push(name);
      continue;
    }

    other.push(name);
  }

  let summary = '';
  for (const [prefix, years] of Object.entries(byDatePrefix)) {
    summary += `  PatrÃ³n detectado: "${prefix} YYYY-MM-DD..." â†’ AÃ±os disponibles:\n`;
    for (const [year, months] of Object.entries(years).sort()) {
      const monthList = [...months].sort().join(', ');
      summary += `    - ${year}: meses [${monthList}] â†’ Usar patrÃ³n glob: "${prefix} ${year}-*."\n`;
    }
  }

  if (numbered.length) {
    summary += `  ${numbered.length} archivos con numeraciÃ³n (ej: "${numbered[0]}", "${numbered[Math.floor(numbered.length / 2)]}")\n`;
  }
  if (other.length > 0 && other.length <= 10) {
    summary += `  Otros archivos: ${other.join(', ')}\n`;
  } else if (other.length > 10) {
    summary += `  ${other.length} archivos sin patrÃ³n reconocible.\n`;
  }

  return summary || '  (sin archivos)\n';
};

export const buildDirectoryTree = async (baseDir, currentDir, depth, maxDepth) => {
  if (depth > maxDepth) return '  '.repeat(depth) + '...\n';

  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const indent = '  '.repeat(depth);
    let tree = depth === 0 ? `${currentDir}${path.sep}\n` : '';

    const dirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
    const files = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.'));

    for (const dir of dirs) {
      const fullPath = path.join(currentDir, dir.name);
      tree += `${indent}â”œâ”€â”€ ðŸ“ ${dir.name}${path.sep}\n`;
      tree += await buildDirectoryTree(baseDir, fullPath, depth + 1, maxDepth);
    }

    if (files.length > 30) {
      tree += `${indent}â””â”€â”€ ðŸ“Š [${files.length} archivos â€” AnÃ¡lisis de patrones:]\n`;
      tree += analyzeFilePatterns(files.map((file) => file.name))
        .split('\n')
        .map((line) => `${indent}   ${line}`)
        .join('\n') + '\n';
    } else {
      for (const file of files) {
        tree += `${indent}â”œâ”€â”€ ðŸ“„ ${file.name}\n`;
      }
    }

    return tree;
  } catch (error) {
    return '  '.repeat(depth) + `[Error leyendo carpeta: ${error.message}]\n`;
  }
};

export const collectDirectoryPaths = async (baseDir, currentDir, depth, maxDepth) => {
  if (depth > maxDepth) return [];

  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const directories = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      directories.push(relativePath);
      directories.push(...await collectDirectoryPaths(baseDir, fullPath, depth + 1, maxDepth));
    }

    return directories;
  } catch {
    return [];
  }
};

export const normalizeRelativePath = (value) => {
  if (!value) return '';

  return String(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
};

export const getRecentClassificationExamples = (profileId, truthSource, limit = 6) => {
  if (!truthSource?.root_path) return [];

  const transactions = transactionsService.listTransactions(profileId).slice(0, 25);
  const seen = new Set();
  const examples = [];

  for (const transaction of transactions) {
    for (const operation of transaction.operations || []) {
      if (operation.action !== 'move' || operation.status !== 'success') continue;
      if (!operation.source || !operation.target) continue;

      const targetDirectory = path.dirname(operation.target);
      const relativePath = normalizeRelativePath(path.relative(truthSource.root_path, targetDirectory));
      if (relativePath.startsWith('..')) continue;

      const fileName = path.basename(operation.source);
      const destination = relativePath || '(root)';
      const key = `${fileName}->${destination}`;
      if (seen.has(key)) continue;

      seen.add(key);
      examples.push({
        file_name: fileName,
        relative_path: destination
      });

      if (examples.length >= limit) return examples;
    }
  }

  return examples;
};
