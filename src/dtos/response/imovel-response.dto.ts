import { Expose, Transform, Type } from 'class-transformer';
import type { FinalidadeImovel, TipoImovel } from '../enums/enums';
import { ImgResponseDto } from './img-response.dto';
import { UserResponseDto } from './user-response.dto';

export class ImovelResponseDto {
  @Expose()
  id: string;

  @Expose()
  usuarioId: string;

  @Expose()
  @Type(() => UserResponseDto)
  usuario: UserResponseDto;

  @Expose()
  titulo: string;

  @Expose()
  descricao: string;

  @Expose()
  tipo: TipoImovel;

  @Expose()
  finalidade: FinalidadeImovel;

  @Expose()
  @Type(() => Number)
  valor: number;

  @Expose()
  @Type(() => Number)
  condominioMensal: number;

  @Expose()
  @Type(() => Number)
  iptuMensal: number;

  @Expose()
  cidade: string;

  @Expose()
  estado: string;

  @Expose()
  bairro: string;

  @Expose()
  @Type(() => Number)
  area: number;

  @Expose()
  quartos: number;

  @Expose()
  banheiros: number;

  @Expose()
  vagasGaragem: number;

  @Expose()
  @Type(() => ImgResponseDto)
  imagens: ImgResponseDto[];

  @Expose()
  comodidades: string[];

  @Expose()
  destaque: boolean;

  @Expose()
  @Transform(
    ({ value }: { value: Date | string }) =>
      value instanceof Date ? value.toISOString() : value,
    { toPlainOnly: true },
  )
  criadoEm: string;

  @Expose()
  @Transform(
    ({ value }: { value: Date | string }) =>
      value instanceof Date ? value.toISOString() : value,
    { toPlainOnly: true },
  )
  atualizadoEm: string;
}
