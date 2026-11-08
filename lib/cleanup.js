import { EventEmitter } from 'events';
import fsp from 'fs/promises';
import path from 'path';

class Cleanup extends EventEmitter {
  #msToDays(mtime) {
    return (Date.now() - mtime.getTime()) / (1000 * 60 * 60 * 24);
  }

  async cleanup(directory, olderThanDays, confirm = false) {
    this.emit('cleanup-start', { directory, olderThanDays, confirm });

    const dirents = await fsp.readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });

    const files = dirents.filter(file => file.isFile());
    const toDelete = [];

    for (const file of files) {
      const filePath = path.join(file.parentPath, file.name);
      const stats = await fsp.stat(filePath);
      const daysOld = this.#msToDays(stats.mtime);

      if (daysOld > olderThanDays) {
        const fileInfo = {
          path: filePath,
          name: file.name,
          size: stats.size,
          daysOld,
          modifiedAt: stats.mtime,
        };

        toDelete.push(fileInfo);
        this.emit('file-found', fileInfo);
      }
    }

    const totalSize = toDelete.reduce((sum, file) => sum + file.size, 0);

    if (!confirm) {
      this.emit('cleanup-complete', {
        files: toDelete,
        totalSize,
        deleted: false,
        confirm: false,
      });
      return;
    }

    for (let i = 0; i < toDelete.length; i++) {
      const file = toDelete[i];
      await fsp.unlink(file.path);

      this.emit('file-deleted', {
        ...file,
        currentFile: i + 1,
        totalFiles: toDelete.length,
      });
    }

    this.emit('cleanup-complete', {
      files: toDelete,
      totalSize,
      deleted: true,
      confirm: true,
    });
  }
}

export default Cleanup;
