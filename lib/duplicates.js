import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

class DuplicateFinder extends EventEmitter {
  #hashGroups = new Map();

  #resetStats() {
    this.#hashGroups = new Map();
  }

  #calculateHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async #processFile(file) {
    const filePath = path.join(file.parentPath, file.name);
    const stats = await fsp.stat(filePath);
    const hash = await this.#calculateHash(filePath);

    if (!this.#hashGroups.has(hash)) {
      this.#hashGroups.set(hash, []);
    }

    this.#hashGroups.get(hash).push({
      path: filePath,
      size: stats.size,
    });
  }

  async find(directory) {
    this.emit('search-start', { directory });
    this.#resetStats();

    const dirents = await fsp.readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });

    const files = dirents.filter(file => file.isFile());

    for (let i = 0; i < files.length; i++) {
      await this.#processFile(files[i]);

      this.emit('file-processed', {
        currentFile: i + 1,
        totalFiles: files.length,
      });
    }

    const groups = [];
    let totalWasted = 0;

    for (const [hash, copies] of this.#hashGroups) {
      if (copies.length <= 1) {
        continue;
      }

      const size = copies[0].size;
      const wasted = size * (copies.length - 1);
      totalWasted += wasted;

      groups.push({
        hash,
        copies,
        size,
        wasted,
      });
    }

    this.emit('duplicates-found', {
      groups,
      totalWasted,
    });
  }
}

export default DuplicateFinder;
