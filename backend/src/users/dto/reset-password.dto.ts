import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiPropertyOptional({
    example: 'TempPass987#',
    description: 'Explicit temporary password to assign. If omitted, a secure temporary password will be auto-generated.',
  })
  @IsString()
  @IsOptional()
  @MinLength(6, { message: 'Temporary password must be at least 6 characters long' })
  temporaryPassword?: string;

  @ApiPropertyOptional({
    example: 'Employee password forgotten',
    description: 'Administrative reason for resetting password (recorded in audit log)',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
