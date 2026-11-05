import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { MESSAGES } from './validation';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = () => new ApiError(404, 'NOT_FOUND', MESSAGES.notFound);

function fromMulterError(error: multer.MulterError): ApiError {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new ApiError(413, 'FILE_TOO_LARGE', MESSAGES.imageSize, { images: MESSAGES.imageSize });
    case 'LIMIT_FILE_COUNT':
      return new ApiError(400, 'VALIDATION_ERROR', MESSAGES.imageCount, { images: MESSAGES.imageCount });
    case 'LIMIT_UNEXPECTED_FILE':
      if (error.field === 'images') {
        return new ApiError(400, 'VALIDATION_ERROR', MESSAGES.imageCount, { images: MESSAGES.imageCount });
      }
      return new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
    default:
      return new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof multer.MulterError) {
    apiError = fromMulterError(error);
  } else if (typeof error?.status === 'number' && error.status >= 400 && error.status < 500) {
    // 깨진 JSON, 너무 큰 요청 본문, 잘못 인코딩된 주소 등 클라이언트 쪽 문제
    apiError = new ApiError(400, 'VALIDATION_ERROR', MESSAGES.badRequest);
  } else {
    console.error(error);
    apiError = new ApiError(500, 'INTERNAL_ERROR', MESSAGES.server);
  }

  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.fields ? { fields: apiError.fields } : {}),
    },
  });
};
