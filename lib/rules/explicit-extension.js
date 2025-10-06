'use strict';

/**
 * Edited by @letterix
 * Original repo: https://github.com/SOUNDBOKS/eslint-plugin-import-esm
 *
 * Changes:
 * - Added support for tsconfig paths
 */

const path = require('path').posix;
const fs = require('fs');
const { getTsconfig } = require('get-tsconfig');
const validExtensions = {
  '.js': true,
  '.mjs': true,
  '.cjs': true,
  '.ts': true,
  '.cts': true,
  '.mts': true,
  '.jsx': true,
  '.tsx': true,
  '.json': true,
  '.css': true,
  '.scss': true,
  '.sass': true,
  '.less': true,
  '.styl': true,
  '.stylus': true,
  '.md': true,
  '.mdx': true,
  '.html': true,
  '.xml': true,
  '.svg': true,
  '.png': true,
  '.jpg': true,
  '.jpeg': true,
  '.gif': true,
  '.webp': true,
  '.ico': true,
  '.bmp': true,
  '.tiff': true,
  '.avif': true,
  '.heic': true,
  '.heif': true,
  '.pem': true,
  '.crt': true,
  '.key': true,
  '.p8': true,
  '.p12': true,
  '.pfx': true
};

const isDirectory = path => {
  let stat;

  try {
    stat = fs.statSync(path);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  return stat ? stat.isDirectory() : false;
};

const getTsPath = (importPath, strippedTsPaths) => {
  for (const [key, value] of Object.entries(strippedTsPaths)) {
    const [first] = value;
    if (first && importPath.startsWith(key)) {
      return path.join(baseUrl, importPath.replace(key, first));
    }
  }
};

const isTsPath = (importPath, strippedTsPaths) => !!getTsPath(importPath, strippedTsPaths);

const getAbsoluteImportPath = (importPath, lintedDirPath, strippedTsPaths) => {
  const tsPath = getTsPath(importPath, strippedTsPaths);

  if (tsPath) {
    return tsPath;
  }

  return path.resolve(lintedDirPath, importPath);
};

const stripTsPathPatternSuffix = tsPathPattern => tsPathPattern.split('*')[0].replace(/\/$/, '');
const getBaseUrl = tsconfigResult => {
  const tsConfigBaseUrl =
    tsconfigResult &&
    tsconfigResult.config &&
    tsconfigResult.config.compilerOptions &&
    tsconfigResult.config.compilerOptions.baseUrl;

  return tsConfigBaseUrl || tsconfigResult.path;
};

const tsconfigResult = getTsconfig();
const baseUrl = getBaseUrl(tsconfigResult);
const tsCompilerOptions = tsconfigResult && tsconfigResult.config && tsconfigResult.config.compilerOptions;
const tsPaths = (tsCompilerOptions && tsCompilerOptions.paths) || {};
const strippedTsPaths = Object.fromEntries(
  Object.entries(tsPaths).map(([key, value]) => [stripTsPathPatternSuffix(key), value.map(stripTsPathPatternSuffix)])
);

const isRelativeImportPath = importPath => {
  for (const [key, value] of Object.entries(strippedTsPaths)) {
    const [first] = value;
    if (first && importPath.startsWith(key)) {
      return true;
    }
  }

  return importPath.startsWith('.');
};

module.exports = {
  meta: {
    type: 'problem',
    messages: {
      missingExtension: 'Missing extension in the source path'
    },
    docs: {
      description: 'Validate if import and export paths have an explicit extension',
      recommended: true
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          extension: {
            type: 'string'
          },
          debug: {
            type: 'boolean'
          }
        }
      }
    ]
  },

  create(context) {
    const options = {
      extension: '.js',
      debug: false,
      ...context.options
    };

    const lintedFilePath = context.getPhysicalFilename();
    const lintedDirPath = path.dirname(lintedFilePath);
    const canFix = !['<input>', '<text>'].includes(lintedFilePath);

    const handleImportOrExportNode = node => {
      // Skip if node does not have a source (regular exports) or is not a literal (e.g.: when template literals).
      if (!node.source || node.source.type !== 'Literal') {
        return;
      }

      const importPath = node.source.value;
      const isRelativeImport = isRelativeImportPath(importPath);
      const extension = path.extname(importPath);
      const hasExtension = !!extension && validExtensions[extension];

      // Skip if this is not a relative import.
      // Skip if an extension is specified.
      if (!isRelativeImport || hasExtension) {
        return;
      }

      context.report({
        messageId: 'missingExtension',
        node: node.source,
        fix: !canFix
          ? null
          : fixer => {
              // Calculate extension-less absolute path.
              // If its a directory, we append /index.
              let absoluteImportPath = getAbsoluteImportPath(importPath, lintedDirPath, strippedTsPaths);
              let newImportPath = importPath;

              if (isDirectory(absoluteImportPath)) {
                newImportPath = path.join(importPath, 'index');
              }

              if (!isTsPath(importPath, strippedTsPaths) && !newImportPath.startsWith('.')) {
                newImportPath = './' + newImportPath;
              }

              newImportPath += options.extension;

              if (options.debug) {
                console.log(`@soundboks/eslint-plugin-import-esm: ${importPath} -> ${newImportPath}`);
              }

              return fixer.replaceText(node.source, `'${newImportPath}'`);
            }
      });
    };

    return {
      ImportExpression: handleImportOrExportNode,
      ImportDeclaration: handleImportOrExportNode,
      ExportNamedDeclaration: handleImportOrExportNode,
      ExportAllDeclaration: handleImportOrExportNode
    };
  }
};
