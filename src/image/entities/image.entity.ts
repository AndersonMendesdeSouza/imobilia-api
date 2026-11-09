import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImovelEntity } from '../../imovel/entities/imovel.entity';
import { UserEntity } from '../../user/entities/user.entity';

@Entity('imagens')
export class ImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  publicUrlId: string;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  usuarioId: string | null;

  @OneToOne(() => UserEntity, (usuario) => usuario.img, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'usuarioId' })
  usuario: UserEntity | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  imovelId: string | null;

  @ManyToOne(() => ImovelEntity, (imovel) => imovel.imagens, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'imovelId' })
  imovel: ImovelEntity | null;
}
