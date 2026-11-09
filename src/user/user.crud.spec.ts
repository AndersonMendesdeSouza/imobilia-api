import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { scrypt } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import type { Repository } from 'typeorm';
import { PerfilUsuario } from '../dtos/enums/enums';
import { UserRequestDto } from '../dtos/request/user-request.dto';
import { UserEntity } from './entities/user.entity';
import { UserService } from './user.service';
import type { ImageService } from '../image/image.service';
import type { JwtService } from '@nestjs/jwt';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

const adminId = '991c7dcb-499b-4071-9fe5-aa5792cb336a';
const anuncianteId = '127776fd-43f6-469e-87df-609b399d4ef8';
const novoId = '45e45f05-577e-4cef-b19b-58f8b46e7756';

function criarUsuario(id: string, perfil: PerfilUsuario): UserEntity {
  return Object.assign(new UserEntity(), {
    id,
    perfil,
    ativo: true,
    nome: id === adminId ? 'Administrador' : 'Anunciante',
    email: id === adminId ? 'admin@example.com' : 'anunciante@example.com',
    senhaHash: 'hash-anterior',
    img: null,
    imoveis: [],
    telefone: null,
    descricao: null,
    cidade: 'Curitiba',
    estado: 'PR',
    criadoEm: new Date('2026-11-09T12:00:00.000Z'),
    atualizadoEm: new Date('2026-11-09T12:00:00.000Z'),
  });
}

function entrada(): UserRequestDto {
  return {
    nome: ' Nova conta ',
    email: ' NOVO@example.com ',
    senha: 'SenhaTeste123!',
    cidade: ' Curitiba ',
    estado: 'PR',
  };
}

describe('UserService CRUD', () => {
  let service: UserService;
  let registros: Map<string, UserEntity>;
  const imageService = { saveImage: jest.fn() };
  const repository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    merge: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    registros = new Map([
      [adminId, criarUsuario(adminId, PerfilUsuario.ADMINISTRADOR)],
      [anuncianteId, criarUsuario(anuncianteId, PerfilUsuario.ANUNCIANTE)],
    ]);
    repository.findOne.mockImplementation(
      async (options: { where: { id?: string; email?: string } }) => {
        const registro = options.where.id
          ? registros.get(options.where.id)
          : [...registros.values()].find(
              (usuario) => usuario.email === options.where.email,
            );
        if (!registro) return null;
        const { senhaHash, ...campos } = registro;
        return Object.assign(new UserEntity(), campos);
      },
    );
    repository.find.mockImplementation(async () => [...registros.values()]);
    repository.create.mockImplementation((campos: Partial<UserEntity>) =>
      Object.assign(new UserEntity(), campos),
    );
    repository.merge.mockImplementation(
      (usuario: UserEntity, campos: Partial<UserEntity>) => {
        for (const [campo, valor] of Object.entries(campos)) {
          if (valor !== undefined) Reflect.set(usuario, campo, valor);
        }
        return usuario;
      },
    );
    repository.save.mockImplementation(async (usuario: UserEntity) => {
      const id = usuario.id ?? novoId;
      const registro =
        registros.get(id) ?? criarUsuario(id, PerfilUsuario.ANUNCIANTE);
      for (const [campo, valor] of Object.entries(usuario)) {
        if (valor !== undefined) Reflect.set(registro, campo, valor);
      }
      registro.id = id;
      registros.set(id, registro);
      return registro;
    });
    repository.remove.mockImplementation(async (usuario: UserEntity) => {
      registros.delete(usuario.id);
      return usuario;
    });
    service = new UserService(
      repository as unknown as Repository<UserEntity>,
      imageService as unknown as ImageService,
      { signAsync: jest.fn() } as unknown as JwtService,
    );
  });

  it('cria uma conta com email normalizado, perfil padrão e hash verificável', async () => {
    const resposta = await service.create(entrada(), adminId);
    const salvo = registros.get(novoId);
    expect(resposta).toMatchObject({
      id: novoId,
      nome: 'Nova conta',
      email: 'novo@example.com',
      perfil: PerfilUsuario.ANUNCIANTE,
      ativo: true,
    });
    expect(salvo?.senhaHash).not.toBe(entrada().senha);
    expect(salvo?.senhaHash).toMatch(
      /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/,
    );
    expect(resposta.senhaHash).toBeUndefined();
    expect(salvo).not.toHaveProperty('senha');
    expect(salvo).not.toHaveProperty('imgs');
    const [algorithm, n, r, p, salt, expected] = (salvo?.senhaHash ?? '').split(
      '$',
    );
    expect(algorithm).toBe('scrypt');
    const derived = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        entrada().senha,
        salt,
        64,
        {
          N: Number(n),
          r: Number(r),
          p: Number(p),
          maxmem: 64 * 1024 * 1024,
        },
        (error, resultado) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(resultado);
        },
      );
    });
    expect(derived.toString('hex')).toBe(expected);
  });

  it('bloqueia criação sem identidade autenticada', async () => {
    await expect(service.create(entrada(), '')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('bloqueia a criação por anunciante ou conta desativada', async () => {
    await expect(
      service.create(entrada(), anuncianteId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const admin = registros.get(adminId);
    if (admin) admin.ativo = false;
    await expect(service.create(entrada(), adminId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('retorna conflito para email já cadastrado antes de gravar', async () => {
    await expect(
      service.create({ ...entrada(), email: ' ADMIN@example.com ' }, adminId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('trata colisão de email detectada pelo PostgreSQL durante a gravação', async () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    repository.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], driverError),
    );
    await expect(service.create(entrada(), adminId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lista usuários com a imagem em ordem de nome', async () => {
    await service.findAll();
    expect(repository.find).toHaveBeenCalledWith({
      relations: { img: true, imoveis: { imagens: true } },
      order: { nome: 'ASC' },
    });
  });

  it('consulta por UUID e informa quando o usuário não existe', async () => {
    await expect(service.findOne(anuncianteId)).resolves.toHaveProperty(
      'id',
      anuncianteId,
    );
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: anuncianteId },
      relations: { img: true, imoveis: { imagens: true } },
    });
    await expect(service.findOne(novoId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('edita o próprio perfil sem alterar senha, permissões ou campos omitidos', async () => {
    const resposta = await service.update(
      anuncianteId,
      { nome: ' Nome revisado ', telefone: null },
      anuncianteId,
    );
    expect(resposta.nome).toBe('Nome revisado');
    expect(resposta.email).toBe('anunciante@example.com');
    expect(resposta.perfil).toBe(PerfilUsuario.ANUNCIANTE);
    expect(registros.get(anuncianteId)?.senhaHash).toBe('hash-anterior');
  });

  it.each([{ perfil: PerfilUsuario.ADMINISTRADOR }, { ativo: false }])(
    'impede escalada de permissões na edição: %j',
    async (dados) => {
      await expect(
        service.update(anuncianteId, dados, anuncianteId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('impede editar a conta de outra pessoa', async () => {
    await expect(
      service.update(adminId, { nome: 'Invasão' }, anuncianteId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('permite ao administrador desativar e alterar o perfil de outra conta', async () => {
    const resposta = await service.update(
      anuncianteId,
      { ativo: false, perfil: PerfilUsuario.ADMINISTRADOR },
      adminId,
    );
    expect(resposta).toMatchObject({
      ativo: false,
      perfil: PerfilUsuario.ADMINISTRADOR,
    });
  });

  it('impede trocar o email por um já utilizado e permite manter o atual', async () => {
    await expect(
      service.update(
        anuncianteId,
        { email: 'admin@example.com' },
        anuncianteId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update(
        anuncianteId,
        { email: ' ANUNCIANTE@example.com ' },
        anuncianteId,
      ),
    ).resolves.toHaveProperty('email', 'anunciante@example.com');
  });

  it('gera outro hash somente quando uma nova senha é enviada', async () => {
    const resposta = await service.update(
      anuncianteId,
      { senha: 'OutraSenha123!' },
      anuncianteId,
    );
    expect(registros.get(anuncianteId)?.senhaHash).toMatch(/^scrypt\$/);
    expect(registros.get(anuncianteId)?.senhaHash).not.toBe('hash-anterior');
    expect(resposta.senhaHash).toBeUndefined();
  });

  it('não aceita id ou hash de senha injetados no corpo', async () => {
    const dados = Object.assign(
      { nome: 'Perfil atualizado' },
      { id: adminId, senhaHash: 'injetado' },
    );
    await service.update(anuncianteId, dados, anuncianteId);
    expect(registros.get(anuncianteId)?.id).toBe(anuncianteId);
    expect(registros.get(anuncianteId)?.senhaHash).toBe('hash-anterior');
  });

  it('somente o administrador pode excluir contas', async () => {
    await expect(
      service.remove(anuncianteId, anuncianteId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.remove).not.toHaveBeenCalled();
    await expect(
      service.remove(anuncianteId, adminId),
    ).resolves.toBeUndefined();
    expect(registros.has(anuncianteId)).toBe(false);
  });

  it('retorna conflito ao excluir uma conta com imóveis vinculados', async () => {
    const driverError = Object.assign(new Error('foreign key violation'), {
      code: '23503',
    });
    repository.remove.mockRejectedValue(
      new QueryFailedError('DELETE', [], driverError),
    );
    await expect(service.remove(anuncianteId, adminId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(registros.has(anuncianteId)).toBe(true);
  });

  it('propaga falhas inesperadas de persistência', async () => {
    repository.save.mockRejectedValue(new Error('Falha de persistência'));
    await expect(
      service.update(anuncianteId, { nome: 'Revisado' }, anuncianteId),
    ).rejects.toThrow('Falha de persistência');
  });
});
