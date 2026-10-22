import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttp
      ? exception.message
      : 'An unexpected internal server error occurred';

    this.logger.error('Unhandled Exception occurred', exception instanceof Error ? exception.stack : exception);

    response.status(status).json({
      success: false,
      message,
      errors: [message],
      details: exception instanceof Error ? exception.message : String(exception),
    });
  }
}
