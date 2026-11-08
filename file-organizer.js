import Scanner from './lib/scanner.js';
import DuplicateFinder from './lib/duplicates.js';

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

async function main() {
  const command = process.argv[2];
  const targetDir = process.argv[3];

  if (!command || !targetDir) {
    console.error('Usage: node file-organizer.js <command> <directory>');
    process.exit(1);
  }

  switch (command) {
    case 'scan':
      await scanDir(targetDir);
      break;
    case 'duplicates':
      await findDuplicates(targetDir);
      break;
    default:
      console.error('Invalid command. Use: scan, duplicates');
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
