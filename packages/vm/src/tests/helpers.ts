import { gzipSync } from 'node:zlib';

export interface TarEntry {
  name: string;
  content: string;
}

function octal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, '0') + ' ';
}

export function createTarGz(entries: TarEntry[]): Buffer {
  let tar = Buffer.alloc(0);

  for (const entry of entries) {
    const content = Buffer.from(entry.content, 'utf8');
    const header = Buffer.alloc(512);

    header.write(entry.name, 0, 100, 'utf8');
    header.write(octal(0o644, 8), 100, 8, 'utf8');
    header.write(octal(0, 8), 108, 8, 'utf8');
    header.write(octal(0, 8), 116, 8, 'utf8');
    header.write(octal(content.length, 12), 124, 12, 'utf8');
    header.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, 'utf8');
    header.write('        ', 148, 8, 'utf8');
    header.write('0', 156, 1, 'utf8');
    header.write('ustar\0', 257, 6, 'utf8');
    header.write('00', 263, 2, 'utf8');

    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    header.write(octal(checksum, 8), 148, 8, 'utf8');

    const contentPadding = (512 - (content.length % 512)) % 512;
    tar = Buffer.concat([tar, header, content, Buffer.alloc(contentPadding)]);
  }

  tar = Buffer.concat([tar, Buffer.alloc(1024)]);
  return gzipSync(tar);
}
