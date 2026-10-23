import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  IsDateString,
  IsArray,
  ValidateNested,
  IsEnum,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export const ALLOWED_PURPOSES = ['KNITTING', 'WEAVING', 'WARPING', 'PILE', 'GROUND', 'WEFT', 'DYED', 'NPD', 'GENERAL'] as const;
export type AllowedPurpose = typeof ALLOWED_PURPOSES[number];

export class CreatePORequirementDto {
  @ApiPropertyOptional({ description: 'Existing Requirement ID if updating' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiProperty({ description: 'Yarn Count (e.g., 1/10 KW, 2/20 OE, 30s Combed)', example: '1/10 KW' })
  @IsNotEmpty({ message: 'Yarn count is required for requirement line' })
  @IsString()
  yarnCount: string;

  @ApiPropertyOptional({ description: 'Quality / Material (e.g. Cotton, PC, Modal)', example: 'Cotton' })
  @IsOptional()
  @IsString()
  quality?: string;

  @ApiPropertyOptional({ description: 'Size specification (e.g. 30x60, 30x30)', example: '30x60' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ description: 'Use For specification (e.g. Bath Towel, Weft Yarn)', example: 'Bath Towel' })
  @IsOptional()
  @IsString()
  useFor?: string;

  @ApiProperty({
    description: 'Purpose (PILE, GROUND, WEFT, DYED, NPD, GENERAL)',
    example: 'PILE',
    enum: ALLOWED_PURPOSES,
  })
  @IsNotEmpty({ message: 'Purpose is required' })
  @IsString()
  @IsIn(ALLOWED_PURPOSES, {
    message: `Purpose must be one of: ${ALLOWED_PURPOSES.join(', ')}`,
  })
  purpose: string;

  @ApiPropertyOptional({ description: 'Pieces count', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Pieces must be a number' })
  @Min(0, { message: 'Pieces cannot be negative' })
  pcs?: number;

  @ApiPropertyOptional({ description: 'Quantity factor / count', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Quantity must be a number' })
  @Min(0, { message: 'Quantity cannot be negative' })
  qty?: number;

  @ApiProperty({ description: 'Total Required Yarn in Kilograms (KG)', example: 500.0, minimum: 0.0001 })
  @IsNotEmpty({ message: 'Required KG is required' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Required KG must be a number' })
  @Min(0.0001, { message: 'Required KG must be greater than 0' })
  requiredKg: number;

  @ApiPropertyOptional({ description: 'Requirement Line remarks or instructions' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'Unique Purchase Order Number', example: 'PO-2026-8801' })
  @IsNotEmpty({ message: 'PO Number is required' })
  @IsString()
  poNumber: string;

  @ApiProperty({ description: 'Party Master UUID (Customer / Buyer)', example: 'd3b07384-d113-467a-9a99-97bc618e7e11' })
  @IsNotEmpty({ message: 'Party must be selected from Party Master' })
  @IsUUID('4', { message: 'Invalid Party ID format' })
  partyId: string;

  @ApiPropertyOptional({ description: 'Order effective date (ISO 8601)', example: '2026-10-07' })
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional({ description: 'Required shipment / delivery due date (ISO 8601)', example: '2026-10-30' })
  @IsOptional()
  @IsDateString()
  deliveryDue?: string;

  @ApiPropertyOptional({ description: 'Total commercial amount in INR', example: 250000.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Total amount must be a number' })
  @Min(0, { message: 'Total amount cannot be negative' })
  totalAmount?: number;

  @ApiPropertyOptional({ description: 'Order level remarks or special notes' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Initial status (DRAFT, ACTIVE, CONFIRMED)', example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    description: 'Yarn Requirement lines for this Purchase Order',
    type: [CreatePORequirementDto],
  })
  @IsArray({ message: 'Requirements must be an array' })
  @ValidateNested({ each: true })
  @Type(() => CreatePORequirementDto)
  requirements: CreatePORequirementDto[];
}
