import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { MAX_IMAGE_BYTES, MAX_IMAGES, UPLOAD_DIR } from './config';
import { ApiError } from './errors';
import { MESSAGES } from './validation';

const parseMultipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES, fields: 20, fieldSize: 128 * 1024 },
}).array('images', MAX_IMAGES);

/** 깨진 multipart는 일반 Error로 올라오므로, 서버 오류가 아니라 잘못된 요청으로 바꾼다. */
export const upload: RequestHandler = (req, res, next) => {
  parseMultipart(req, res, (error: unknown) => {
    if (!error || error instanceof multer.MulterError) return next(error);
    next(new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest));
  });
};

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  data.length >= offset + bytes.length && bytes.every((byte, index) => data[offset + index] === byte);

const ascii = (text: string) => [...Buffer.from(text, 'ascii')];

/** 클라이언트가 보낸 형식 정보는 믿지 않고 파일 앞부분의 시그니처로 판단한다. */
function detectExtension(data: Buffer): string | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return '.jpg';
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return '.png';
  if (startsWith(data, ascii('GIF87a')) || startsWith(data, ascii('GIF89a'))) return '.gif';
  if (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) return '.webp';
  return null;
}

export type PreparedImage = { filename: string; data: Buffer };

export function prepareImages(files: Express.Multer.File[]): PreparedImage[] {
  return files.map((file) => {
    const detected = detectExtension(file.buffer);
    const declared = path.extname(file.originalname).toLowerCase();
    if (!detected || !ALLOWED_EXTENSIONS.has(declared)) {
      throw new ApiError(415, 'UNSUPPORTED_IMAGE', MESSAGES.imageType, { images: MESSAGES.imageType });
    }
    return { filename: `${randomUUID()}${detected}`, data: file.buffer };
  });
}

export async function writeImages(images: PreparedImage[]) {
  try {
    await Promise.all(
      images.map((image) => writeFile(path.join(UPLOAD_DIR, image.filename), image.data, { flag: 'wx' })),
    );
  } catch (error) {
    await removeImages(images.map((image) => image.filename));
    throw error;
  }
}

/** DB 반영이 끝난 뒤의 정리 작업이므로, 파일 삭제 실패는 기록만 하고 요청을 실패시키지 않는다. */
export async function removeImages(filenames: string[]) {
  const results = await Promise.allSettled(
    filenames.map((filename) => rm(path.join(UPLOAD_DIR, filename), { force: true })),
  );
  for (const result of results) {
    if (result.status === 'rejected') console.error('이미지 파일 삭제 실패', result.reason);
  }
}
