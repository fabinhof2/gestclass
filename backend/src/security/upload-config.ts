import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname } from 'path';

type UploadProfile = 'image' | 'document' | 'media' | 'mixed';

const MB = 1024 * 1024;

const PROFILE_RULES: Record<
  UploadProfile,
  { maxBytes: number; exts: string[]; mimes: string[] }
> = {
  image: {
    maxBytes: 5 * MB,
    exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  document: {
    maxBytes: 10 * MB,
    exts: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.txt'],
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain',
    ],
  },
  media: {
    maxBytes: 20 * MB,
    exts: [
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif',
      '.mp4',
      '.webm',
      '.mp3',
      '.wav',
      '.ogg',
      '.m4a',
      '.pdf',
    ],
    mimes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'application/pdf',
    ],
  },
  mixed: {
    maxBytes: 15 * MB,
    exts: [
      '.pdf',
      '.doc',
      '.docx',
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif',
      '.mp4',
      '.webm',
      '.mp3',
      '.wav',
      '.ogg',
      '.m4a',
      '.txt',
    ],
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'text/plain',
    ],
  },
};

function ensureUploadDir(destination: string) {
  mkdirSync(destination, { recursive: true });
}

export function createUploadOptions(config: {
  destination: string;
  filePrefix: string;
  profile: UploadProfile;
}): MulterOptions {
  const rules = PROFILE_RULES[config.profile];
  ensureUploadDir(config.destination);

  return {
    storage: diskStorage({
      destination: config.destination,
      filename: (_req, file, callback) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const extension = extname(file.originalname).toLowerCase();
        callback(null, `${config.filePrefix}-${uniqueSuffix}${extension}`);
      },
    }),
    limits: {
      fileSize: rules.maxBytes,
      files: 1,
    },
    fileFilter: (_req, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      const mimeType = String(file.mimetype || '').toLowerCase();
      const allowedExtension = rules.exts.includes(extension);
      const allowedMime = rules.mimes.includes(mimeType);

      if (!allowedExtension || !allowedMime) {
        callback(
          new BadRequestException(
            'Tipo de arquivo nao permitido para este envio.',
          ),
          false,
        );
        return;
      }

      callback(null, true);
    },
  };
}
