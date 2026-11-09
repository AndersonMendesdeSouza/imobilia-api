process.env.JWT_SECRET = 'chave-exclusiva-para-testes-de-imagem-usuario';
require('reflect-metadata');
const path = require('node:path');
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: { 'src/*': ['dist/*'] },
});
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { Test } = require('@nestjs/testing');
const { getRepositoryToken } = require('@nestjs/typeorm');
const { Reflector } = require('@nestjs/core');
const {
  ClassSerializerInterceptor,
  ValidationPipe,
} = require('@nestjs/common');
const request = require('supertest');
const { UserModule } = require('../dist/user/user.module');
const { UserEntity } = require('../dist/user/entities/user.entity');
const { ImageEntity } = require('../dist/image/entities/image.entity');
const { ImageService } = require('../dist/image/image.service');
const cloudinaryConfig = require('../dist/config/cloudinary.config');
const usuarioId = '991c7dcb-499b-4071-9fe5-aa5792cb336a';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
  'base64',
);
let app;
let usuario;
let imagem;
let falhaAoSalvar;
let falhaNoUpload;
let falhaNaLimpeza;
let uploads;
const eventos = [];
const removidos = [];

function fotoAnterior() {
  imagem = Object.assign(new ImageEntity(), {
    id: randomUUID(),
    url: 'https://example.com/antiga.png',
    publicUrlId: 'antiga',
    isPrimary: true,
    usuarioId,
    imovelId: null,
  });
  return imagem;
}

before(async () => {
  cloudinaryConfig.configureCloudinary = () => ({
    uploader: {
      upload_stream: (_options, callback) => ({
        end: () => {
          const id = `nova-${++uploads}`;
          eventos.push('upload');
          if (falhaNoUpload) callback({ message: 'Falha no upload' });
          else
            callback(null, {
              secure_url: `https://example.com/${id}.png`,
              public_id: id,
            });
        },
      }),
      destroy: async (id) => {
        removidos.push(id);
        eventos.push(`remover:${id}`);
        if (falhaNaLimpeza) throw new Error('Falha na limpeza');
        return { result: 'ok' };
      },
    },
  });
  const userRepository = {
    findOne: async ({ where, relations }) => {
      if (where.id)
        assert.deepEqual(relations, { img: true, imoveis: { imagens: true } });
      if (where.id !== usuario.id && where.email !== usuario.email) return null;
      return Object.assign(new UserEntity(), usuario, { img: imagem });
    },
    find: async ({ relations }) => {
      assert.deepEqual(relations, { img: true, imoveis: { imagens: true } });
      return [Object.assign(new UserEntity(), usuario, { img: imagem })];
    },
    create: (input) => Object.assign(new UserEntity(), input),
    save: async (input) => {
      usuario = Object.assign(new UserEntity(), input, {
        id: randomUUID(),
        imoveis: [],
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });
      return usuario;
    },
  };
  const imageRepository = {
    create: (input) => Object.assign(new ImageEntity(), input),
    save: async (input) => {
      eventos.push('salvar');
      if (falhaAoSalvar) throw new Error('Falha ao salvar a imagem');
      const rows = Array.isArray(input) ? input : [input];
      assert.equal(rows.length, 1);
      assert.equal(rows[0].usuarioId, usuario.id);
      assert.equal(rows[0].imovelId, null);
      if (imagem)
        assert.equal(
          rows[0].id,
          imagem.id,
          'Deve atualizar a imagem existente',
        );
      imagem = Object.assign(new ImageEntity(), rows[0], {
        id: rows[0].id ?? randomUUID(),
      });
      return Array.isArray(input) ? [imagem] : imagem;
    },
  };
  const module = await Test.createTestingModule({ imports: [UserModule] })
    .overrideProvider(getRepositoryToken(UserEntity))
    .useValue(userRepository)
    .overrideProvider(getRepositoryToken(ImageEntity))
    .useValue(imageRepository)
    .compile();
  app = module.createNestApplication({ logger: false });
  module.get(ImageService).logger.error = () => {};
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: true,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
});

beforeEach(() => {
  usuario = Object.assign(new UserEntity(), {
    id: usuarioId,
    nome: 'Anunciante',
    email: 'teste@example.com',
    senhaHash: 'nao-retornar',
    perfil: 'anunciante',
    ativo: true,
    img: null,
    imoveis: [],
    telefone: null,
    descricao: null,
    cidade: 'Buriti Alegre',
    estado: 'GO',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  });
  imagem = null;
  falhaAoSalvar = falhaNoUpload = falhaNaLimpeza = false;
  uploads = 0;
  eventos.length = removidos.length = 0;
});
after(async () => {
  if (app) await app.close();
});
const enviar = (id = usuarioId) =>
  request(app.getHttpServer()).put(`/user/${id}/img`);
const anexar = (req, buffer = png) =>
  req.attach('file', buffer, {
    filename: 'perfil.png',
    contentType: 'image/png',
  });

test('cria a foto sem autenticação e retorna o usuário com img vinculada', async () => {
  const response = await anexar(enviar());
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.id, usuarioId);
  assert.equal(response.body.img.usuarioId, usuarioId);
  assert.equal(response.body.img.imovelId, null);
  assert.equal(response.body.img.isPrimary, true);
  assert.equal(response.body.img.url, 'https://example.com/nova-1.png');
  assert.equal(response.body.senhaHash, undefined);
  assert.deepEqual(removidos, []);
});

test('substitui a foto no mesmo registro e limpa a antiga após salvar', async () => {
  const anterior = fotoAnterior();
  const response = await anexar(enviar());
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.img.id, anterior.id);
  assert.deepEqual(eventos, ['upload', 'salvar', 'remover:antiga']);
});

test('se salvar falhar, preserva a imagem anterior e limpa o upload novo', async () => {
  const anterior = fotoAnterior();
  falhaAoSalvar = true;
  assert.equal((await anexar(enviar())).status, 500);
  assert.equal(imagem, anterior);
  assert.deepEqual(removidos, ['nova-1']);
});

test('limpa o primeiro upload se inserir a imagem falhar', async () => {
  falhaAoSalvar = true;
  assert.equal((await anexar(enviar())).status, 500);
  assert.equal(imagem, null);
  assert.deepEqual(removidos, ['nova-1']);
});

test('se o upload falhar, mantém a imagem atual', async () => {
  const anterior = fotoAnterior();
  falhaNoUpload = true;
  assert.equal((await anexar(enviar())).status, 500);
  assert.equal(imagem, anterior);
  assert.deepEqual(removidos, []);
});

test('uma falha ao limpar a foto antiga não perde a nova já salva', async () => {
  fotoAnterior();
  falhaNaLimpeza = true;
  const response = await anexar(enviar());
  assert.equal(response.status, 200);
  assert.equal(response.body.img.publicUrlId, 'nova-1');
});

test('retorna 404 para usuário inexistente antes do upload', async () => {
  assert.equal((await anexar(enviar(randomUUID()))).status, 404);
  assert.equal(uploads, 0);
});

test('valida UUID, presença, tipo, tamanho e quantidade de arquivos', async () => {
  assert.equal((await anexar(enviar('id-invalido'))).status, 400);
  assert.equal((await enviar()).status, 400);
  assert.equal((await anexar(enviar(), Buffer.from('texto'))).status, 400);
  assert.equal((await anexar(enviar(), Buffer.alloc(1048577))).status, 413);
  assert.equal((await anexar(anexar(enviar()))).status, 400);
  assert.equal(
    (await enviar().attach('files', png, { filename: 'foto.png' })).status,
    400,
  );
  assert.equal(uploads, 0);
});

test('usa o ID da URL mesmo se outro usuarioId for enviado no formulário', async () => {
  const response = await anexar(enviar().field('usuarioId', randomUUID()));
  assert.equal(response.status, 200);
  assert.equal(response.body.img.usuarioId, usuarioId);
});

test('mantém a criação do usuário via JSON sem arquivo', async () => {
  const response = await request(app.getHttpServer()).post('/user').send({
    nome: 'Nova conta',
    email: 'nova@example.com',
    senha: 'SenhaTeste123!',
    cidade: 'Buriti Alegre',
    estado: 'GO',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.email, 'nova@example.com');
  assert.equal(response.body.img, null);
  assert.equal(response.body.senhaHash, undefined);
  assert.equal(uploads, 0);
});

test('lista os imóveis relacionados no usuário com imagens e sem repetir o usuário', async () => {
  const imovelId = randomUUID();
  usuario.imoveis = [
    {
      id: imovelId,
      usuarioId,
      titulo: 'Casa do anunciante',
      descricao: 'Casa ampla com jardim em localização tranquila.',
      tipo: 'casa',
      finalidade: 'venda',
      valor: '450000.50',
      condominioMensal: '0.00',
      iptuMensal: '120.00',
      area: '180.25',
      quartos: 3,
      banheiros: 2,
      vagasGaragem: 2,
      cidade: 'Buriti Alegre',
      estado: 'GO',
      bairro: 'Centro',
      comodidades: ['Jardim'],
      destaque: true,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
      imagens: [
        {
          id: randomUUID(),
          url: 'https://example.com/casa.jpg',
          publicUrlId: 'casa',
          isPrimary: true,
          usuarioId: null,
          imovelId,
        },
      ],
    },
  ];
  for (const url of ['/user', `/user/${usuarioId}`]) {
    const response = await request(app.getHttpServer()).get(url);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const user = Array.isArray(response.body)
      ? response.body[0]
      : response.body;
    assert.equal(user.imoveis.length, 1);
    assert.equal(user.imoveis[0].id, imovelId);
    assert.equal(user.imoveis[0].valor, 450000.5);
    assert.equal(user.imoveis[0].area, 180.25);
    assert.equal(
      user.imoveis[0].imagens[0].url,
      'https://example.com/casa.jpg',
    );
    assert.equal(typeof user.imoveis[0].criadoEm, 'string');
    assert.equal(user.imoveis[0].usuario, undefined);
    assert.equal(user.senhaHash, undefined);
  }
});
