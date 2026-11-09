import { PerfilUsuario } from 'src/dtos/enums/enums';
import { ImovelEntity } from 'src/imovel/entities/imovel.entity';
import { ImageEntity } from '../../image/entities/image.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('usuarios')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  nome: string;

  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  senhaHash: string;

  @Column({
    type: 'enum',
    enum: PerfilUsuario,
    default: PerfilUsuario.ANUNCIANTE,
  })
  perfil: PerfilUsuario;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @OneToOne(() => ImageEntity, (imagem) => imagem.usuario, { nullable: true })
  img: ImageEntity | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'varchar', length: 100 })
  cidade: string;

  @Column({ type: 'varchar', length: 2 })
  estado: string;

  @OneToMany(() => ImovelEntity, (imovel) => imovel.usuario)
  imoveis: ImovelEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
