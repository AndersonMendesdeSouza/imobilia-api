import { TipoImovel, FinalidadeImovel } from 'src/dtos/enums/enums';
import { UserEntity } from 'src/user/entities/user.entity';
import { ImageEntity } from '../../image/entities/image.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';


@Entity('imoveis')
export class ImovelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  usuarioId: string;

  @ManyToOne(() => UserEntity, (usuario) => usuario.imoveis, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'usuarioId' })
  usuario: UserEntity;

  @Column({ type: 'varchar', length: 150 })
  titulo: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'enum', enum: TipoImovel })
  tipo: TipoImovel;

  @Column({ type: 'enum', enum: FinalidadeImovel })
  finalidade: FinalidadeImovel;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  valor: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  condominioMensal: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  iptuMensal: string;

  @Column({ type: 'varchar', length: 100 })
  cidade: string;

  @Column({ type: 'varchar', length: 2 })
  estado: string;

  @Column({ type: 'varchar', length: 100 })
  bairro: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  area: string;

  @Column({ type: 'integer', default: 0 })
  quartos: number;

  @Column({ type: 'integer', default: 0 })
  banheiros: number;

  @Column({ type: 'integer', default: 0 })
  vagasGaragem: number;

  @OneToMany(() => ImageEntity, (imagem) => imagem.imovel)
  imagens: ImageEntity[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  comodidades: string[];

  @Column({ type: 'boolean', default: false })
  destaque: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
