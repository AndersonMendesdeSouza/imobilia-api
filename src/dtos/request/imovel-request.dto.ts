import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { FinalidadeImovel, TipoImovel } from '../enums/enums';
import { ESTADOS_BRASILEIROS } from '../estados';

// usuarioId vem da sessão; destaque é alterado exclusivamente pela administração.
export class ImovelRequestDto {
  @IsString()
  @Length(3, 150)
  titulo: string;

  @IsString()
  @Length(30, 2500)
  descricao: string;

  @IsEnum(TipoImovel)
  tipo: TipoImovel;

  @IsEnum(FinalidadeImovel)
  finalidade: FinalidadeImovel;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999999999.99)
  valor: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  condominioMensal: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  iptuMensal: number;

  @IsString()
  @Length(2, 100)
  cidade: string;

  @IsIn(ESTADOS_BRASILEIROS)
  estado: string;

  @IsString()
  @Length(2, 100)
  bairro: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  area: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quartos: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  banheiros: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  vagasGaragem: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (value ? [value] : []) : value,
  )
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  comodidades: string[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  imagensRemovidas?: string[];
}
