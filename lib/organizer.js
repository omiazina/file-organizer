import { EventEmitter } from 'events';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

const CATEGORIES = {
  Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
  Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
  Other: [],
};

class Organizer extends EventEmitter {
  #getCategory(extension) {
    const ext = extension.toLowerCase();

    for (const [category, extensions] of Object.entries(CATEGORIES)) {
      if (category === 'Other') {
        continue;
      }
      if (extensions.includes(ext)) {
        return category;
      }
    }

    return 'Other';
  }

  async #resolveTargetPath(targetDir, fileName) {
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    let candidate = path.join(targetDir, fileName);
    let counter = 1;

    while (true) {
      try {
        await fsp.access(candidate);
        candidate = path.join(targetDir, `${baseName}(${counter})${ext}`);
        counter++;
      } catch (error) {
        if (error.code === 'ENOENT') {
          return candidate;
        }
        throw error;
      }
    }
  }

  async #copyFile(sourcePath, targetPath, size) {
    if (size >= LARGE_FILE_THRESHOLD) {
      await pipeline(
        fs.createReadStream(sourcePath),
        fs.createWriteStream(targetPath)
      );
      return;
    }

    await fsp.copyFile(sourcePath, targetPath);
  }

  async organize(sourceDir, outputDir) {
    this.emit('organize-start', { sourceDir, outputDir });

    const summary = {};
    for (const category of Object.keys(CATEGORIES)) {
      summary[category] = { count: 0, path: path.join(outputDir, category) };
    }

    let totalCopied = 0;
    let totalSize = 0;

    for (const category of Object.keys(CATEGORIES)) {
      const categoryPath = path.join(outputDir, category);
      await fsp.mkdir(categoryPath, { recursive: true });
      this.emit('folder-created', { category, path: categoryPath });
    }

    const dirents = await fsp.readdir(sourceDir, {
      recursive: true,
      withFileTypes: true,
    });

    const files = dirents.filter(file => file.isFile());

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sourcePath = path.join(file.parentPath, file.name);
      const extension = path.extname(file.name);
      const category = this.#getCategory(extension);
      const categoryDir = path.join(outputDir, category);

      try {
        const stats = await fsp.stat(sourcePath);
        const targetPath = await this.#resolveTargetPath(categoryDir, file.name);

        this.emit('copy-start', {
          sourcePath,
          targetPath,
          currentFile: i + 1,
          totalFiles: files.length,
        });

        await this.#copyFile(sourcePath, targetPath, stats.size);

        summary[category].count++;
        totalCopied++;
        totalSize += stats.size;

        this.emit('copy-complete', {
          sourcePath,
          targetPath,
          currentFile: i + 1,
          totalFiles: files.length,
        });
      } catch (error) {
        this.emit('copy-error', {
          sourcePath,
          error,
          currentFile: i + 1,
          totalFiles: files.length,
        });
      }
    }

    this.emit('organize-complete', {
      summary,
      totalCopied,
      totalSize,
      outputDir,
    });
  }
}

export default Organizer;
