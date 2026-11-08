import Scanner from './lib/scanner.js';
import DuplicateFinder from './lib/duplicates.js';
import Organizer from './lib/organizer.js';
import Cleanup from './lib/cleanup.js';

function handleFsError(error, target) {
  if (error.code === 'ENOENT') {
    console.error(`❌ Error: Directory not found: ${target}`);
  } else if (error.code === 'EACCES') {
    console.error(`❌ Error: Permission denied: ${target}`);
  } else {
    console.error(`❌ Unexpected error: ${error.message}`);
  }
  process.exit(1);
}

async function scanDir(dir) {
  const scanner = new Scanner();

  scanner.on('scan-start', data => {
    console.log(`📂 Scanning: ${data.directory}`);
  });

  scanner.on('file-found', data => {
    process.stdout.write(
      `\rProcessing... ${drawProgressBar(data.currentFile, data.totalFiles)} files`
    );
  });

  scanner.on('scan-complete', data => {
    console.log(`\n\n📊 Scan Results:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Total files: ${data.totalFiles}`);
    console.log(`Total size: ${formatSize(data.totalSize)}`);

    if (!data.totalFiles) {
      return;
    }

    console.log(`\nBy File Type:`);

    console.log(
      Object.entries(data.filesByExtension)
        .sort(([extA, extB]) => {
          if (extA === '(other)') {
            return extB === '(other)' ? 0 : 1;
          }
          if (extB === '(other)') {
            return -1;
          }
          return extA.localeCompare(extB);
        })
        .map(
          ([ext, stats]) =>
            `${ext}\t${stats.count} files\t\t${formatSize(stats.size)}`
        )
        .join('\n')
    );

    console.log(`\nFile Age:`);
    console.log(`Last 7 days:\t\t${data.mtimeCounters.last7Days} files`);
    console.log(`Last 30 days:\t\t${data.mtimeCounters.last30Days} files`);
    console.log(
      `Older than 90:\t\t${data.mtimeCounters.olderThan90Days} files`
    );

    const colWidth = Math.max(
      ...data.largestFiles.map(file => file.name.length)
    );

    console.log(`\nLargest files:`);
    console.log(
      data.largestFiles
        .map(
          (file, i) =>
            `${i + 1}. ${file.name.padEnd(colWidth)}\t${formatSize(file.size)}`
        )
        .join('\n')
    );

    console.log(
      `\nOldest file: ${data.oldestFile.name} (modified ${Math.floor(data.oldestFile.ageInDays)} days ago)`
    );
  });

  try {
    await scanner.scan(dir);
  } catch (error) {
    handleFsError(error, dir);
  }
}

async function findDuplicates(dir) {
  const finder = new DuplicateFinder();

  finder.on('search-start', data => {
    console.log(`🔍 Searching for duplicates in: ${data.directory}`);
  });

  finder.on('file-processed', data => {
    process.stdout.write(
      `\rCalculating hashes... ${drawProgressBar(data.currentFile, data.totalFiles)} files`
    );
  });

  finder.on('duplicates-found', data => {
    console.log('');

    if (data.groups.length === 0) {
      console.log('\nNo duplicates found.');
      return;
    }

    console.log(
      `\nFound ${data.groups.length} duplicate groups (${formatSize(data.totalWasted)} wasted):\n`
    );

    data.groups.forEach((group, index) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(
        `Group ${index + 1} (${group.copies.length} copies, ${formatSize(group.size)} each):`
      );
      console.log(`SHA-256: ${group.hash.slice(0, 12)}...`);
      console.log('');

      for (const copy of group.copies) {
        console.log(`📄 ${copy.path}`);
      }

      console.log(`\nWasted space: ${formatSize(group.wasted)}\n`);
    });

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`💾 Total wasted space: ${formatSize(data.totalWasted)}`);
  });

  try {
    await finder.find(dir);
  } catch (error) {
    handleFsError(error, dir);
  }
}

async function organizeDir(sourceDir, outputDir) {
  const organizer = new Organizer();

  organizer.on('organize-start', data => {
    console.log(`📦 Organizing: ${data.sourceDir}`);
    console.log(`Target: ${data.outputDir}`);
    console.log(`\nCreating folders...`);
  });

  organizer.on('folder-created', data => {
    console.log(`✓ ${data.category}/`);
  });

  organizer.on('copy-start', () => {
    // progress is updated on copy-complete
  });

  organizer.on('copy-complete', data => {
    if (data.currentFile === 1) {
      console.log(`\nCopying files...`);
    }
    process.stdout.write(
      `\r${drawProgressBar(data.currentFile, data.totalFiles)}`
    );
  });

  organizer.on('copy-error', data => {
    console.error(
      `\n❌ Error copying ${data.sourcePath}: ${data.error.message}`
    );
  });

  organizer.on('organize-complete', data => {
    console.log(`\n\n✅ Organization complete!\n`);
    console.log(`Summary:`);

    for (const [category, info] of Object.entries(data.summary)) {
      console.log(
        `${category}: ${info.count} files → ${info.path}/`
      );
    }

    console.log(
      `\nTotal copied: ${data.totalCopied} files (${formatSize(data.totalSize)})`
    );
  });

  try {
    await organizer.organize(sourceDir, outputDir);
  } catch (error) {
    handleFsError(error, sourceDir);
  }
}

function printCleanupFileList(files, totalSize) {
  if (files.length === 0) {
    console.log(`Found 0 files to delete.`);
    return;
  }

  console.log(`Found ${files.length} files to delete:\n`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const previewLimit = 3;
  const preview = files.slice(0, previewLimit);

  for (const file of preview) {
    const modifiedDate = file.modifiedAt.toISOString().slice(0, 10);
    console.log(`${file.name}`);
    console.log(`Size: ${formatSize(file.size)}`);
    console.log(
      `Modified: ${Math.floor(file.daysOld)} days ago (${modifiedDate})\n`
    );
  }

  if (files.length > previewLimit) {
    console.log(`... (${files.length - previewLimit} more files)`);
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\nTotal: ${files.length} files (${formatSize(totalSize)})`);
}

async function cleanupDir(dir, olderThanDays, confirm) {
  try {
    const finder = new Cleanup();
    let foundFiles = [];
    let totalSize = 0;

    finder.on('cleanup-start', data => {
      console.log(`🧹 Cleanup: ${data.directory}`);
      console.log(
        `Looking for files older than ${data.olderThanDays} days...\n`
      );
    });

    finder.on('cleanup-complete', data => {
      foundFiles = data.files;
      totalSize = data.totalSize;
      printCleanupFileList(data.files, data.totalSize);
    });

    await finder.cleanup(dir, olderThanDays, false);

    if (foundFiles.length === 0) {
      return;
    }

    if (!confirm) {
      console.log(
        `\n⚠️ DRY RUN MODE: No files were deleted.\nTo actually delete these files, run with --confirm flag.`
      );
      return;
    }

    console.log(
      `\n⚠️ DELETING ${foundFiles.length} files (${formatSize(totalSize)}). This action cannot be undone!\n`
    );

    const deleter = new Cleanup();

    deleter.on('file-deleted', data => {
      if (data.currentFile === 1) {
        console.log(`Deleting...`);
      }
      process.stdout.write(
        `\r${drawProgressBar(data.currentFile, data.totalFiles)}`
      );
    });

    deleter.on('cleanup-complete', data => {
      console.log(
        `\n\n✅ Cleanup complete! Deleted: ${data.files.length} files (${formatSize(data.totalSize)} freed)`
      );
    });

    await deleter.cleanup(dir, olderThanDays, true);
  } catch (error) {
    handleFsError(error, dir);
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const positional = [];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' || arg === '--older-than') {
      flags[arg] = args[i + 1];
      i++;
      continue;
    }

    if (arg === '--confirm') {
      flags[arg] = true;
      continue;
    }

    if (arg.startsWith('--')) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }

    positional.push(arg);
  }

  return { command, positional, flags };
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv);

  if (!command) {
    console.error(
      'Usage: node file-organizer.js <scan|duplicates|organize|cleanup> <directory> [options]'
    );
    process.exit(1);
  }

  switch (command) {
    case 'scan': {
      const targetDir = positional[0];
      if (!targetDir) {
        console.error('Usage: node file-organizer.js scan <directory>');
        process.exit(1);
      }
      await scanDir(targetDir);
      break;
    }
    case 'duplicates': {
      const targetDir = positional[0];
      if (!targetDir) {
        console.error('Usage: node file-organizer.js duplicates <directory>');
        process.exit(1);
      }
      await findDuplicates(targetDir);
      break;
    }
    case 'organize': {
      const sourceDir = positional[0];
      const outputDir = flags['--output'];

      if (!sourceDir || !outputDir) {
        console.error(
          'Usage: node file-organizer.js organize <source> --output <target>'
        );
        process.exit(1);
      }

      await organizeDir(sourceDir, outputDir);
      break;
    }
    case 'cleanup': {
      const targetDir = positional[0];
      const olderThan = flags['--older-than'];
      const confirm = Boolean(flags['--confirm']);

      if (!targetDir || olderThan === undefined) {
        console.error(
          'Usage: node file-organizer.js cleanup <directory> --older-than <days> [--confirm]'
        );
        process.exit(1);
      }

      const olderThanDays = Number(olderThan);
      if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
        console.error('❌ Error: --older-than must be a non-negative number');
        process.exit(1);
      }

      await cleanupDir(targetDir, olderThanDays, confirm);
      break;
    }
    default:
      console.error(
        'Invalid command. Use: scan, duplicates, organize, or cleanup'
      );
      process.exit(1);
  }
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

function drawProgressBar(current, total, width = 20) {
  if (total === 0) {
    return `${'░'.repeat(width)} 0/0`;
  }
  const percentage = current / total;
  const filled = Math.round(percentage * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

main();
