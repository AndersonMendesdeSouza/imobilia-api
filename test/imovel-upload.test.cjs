process.env.JWT_SECRET = 'chave-exclusiva-para-testes-de-upload-imovel';
require('reflect-metadata');
const path = require('node:path');
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: { 'src/*': ['dist/*'] },
});

const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { Test } = require('@nestjs/testing');
const { JwtService } = require('@nestjs/jwt');
const { getRepositoryToken } = require('@nestjs/typeorm');
const {
  ClassSerializerInterceptor,
  ValidationPipe,
} = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const request = require('supertest');
const { ImovelModule } = require('../dist/imovel/imovel.module');
const { ImovelEntity } = require('../dist/imovel/entities/imovel.entity');
const { UserEntity } = require('../dist/user/entities/user.entity');
const { ImageEntity } = require('../dist/image/entities/image.entity');
const { ImovelService } = require('../dist/imovel/imovel.service');
const { ImovelRequestDto } = require('../dist/dtos/request/imovel-request.dto');
const { ImageService } = require('../dist/image/image.service');
const cloudinaryConfig = require('../dist/config/cloudinary.config');

const usuarioId = '991c7dcb-499b-4071-9fe5-aa5792cb336a';
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const token = (sub = usuarioId) =>
  jwt.sign({ sub, perfil: 'anunciante' }, { expiresIn: 3600 });
const imovelId = 'c6758db7-5121-44cb-a562-72a64dc36e2d';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
  'base64',
);
const dados = {
  titulo: 'Casa com jardim',
  descricao: 'Casa ampla com jardim e uma localização tranquila para morar.',
  tipo: 'casa',
  finalidade: 'venda',
  valor: 450000,
  condominioMensal: 0,
  iptuMensal: 120,
  cidade: 'Buriti Alegre',
  estado: 'GO',
  bairro: 'Centro',
  area: 180,
  quartos: 3,
  banheiros: 2,
  vagasGaragem: 2,
  comodidades: ['Jardim'],
};

let app;
let salvo;
let imagensSalvas;
let uploads;
let gravacoes;
let usuarioAtivo;
const chamadas = [];

before(async () => {
  // Só o Cloudinary e os repositórios são simulados; nenhuma conexão externa.
  cloudinaryConfig.configureCloudinary = () => ({
    uploader: {
      upload_stream: (_options, callback) => ({
        end: () => {
          const id = `foto-${++uploads}`;
          callback(null, {
            secure_url: `https://example.com/${id}.png`,
            public_id: id,
          });
        },
      }),
      destroy: async () => ({ result: 'ok' }),
    },
  });
  const imagens = new ImageService({
    create: (input) => ({ ...input }),
    save: async (inputs) => {
      gravacoes++;
      imagensSalvas = inputs.map((input, index) => ({
        ...input,
        id: `imagem-${index}`,
      }));
      return imagensSalvas;
    },
  });
  const usuarios = {
    findOne: async (id) => ({ id, ativo: usuarioAtivo, perfil: 'anunciante' }),
  };
  const service = new ImovelService(
    {
      create: (input) => ({ ...input }),
      find: async () => (salvo ? [salvo] : []),
      save: async (input) => {
        gravacoes++;
        salvo = {
          ...input,
          id: imovelId,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        };
        return salvo;
      },
      findOne: async () =>
        salvo && {
          ...salvo,
          imagens: imagensSalvas.filter(
            (imagem) => imagem.imovelId === salvo.id,
          ),
        },
      merge: (entity, input) => {
        for (const [key, value] of Object.entries(input)) {
          if (value !== undefined) entity[key] = value;
        }
        return entity;
      },
    },
    usuarios,
    imagens,
  );
  const create = service.create.bind(service);
  service.create = async (dto, id, files) => {
    chamadas.push({ dto, usuarioId: id, files });
    return create(dto, id, files);
  };
  const module = await Test.createTestingModule({ imports: [ImovelModule] })
    .overrideProvider(ImovelService)
    .useValue(service)
    .overrideProvider(getRepositoryToken(UserEntity))
    .useValue({})
    .overrideProvider(getRepositoryToken(ImageEntity))
    .useValue({})
    .overrideProvider(getRepositoryToken(ImovelEntity))
    .useValue({})
    .compile();
  app = module.createNestApplication();
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
  chamadas.length = 0;
  uploads = 0;
  gravacoes = 0;
  usuarioAtivo = true;
  salvo = undefined;
  imagensSalvas = [];
});
after(async () => {
  if (app) await app.close();
});

function enviar(payload = dados, autenticado = true) {
  const req = request(app.getHttpServer()).post('/imovel');
  if (autenticado) req.set('Authorization', `Bearer ${token()}`);
  req.field('dto', JSON.stringify(payload));
  return req;
}
function imagem(
  req,
  nome = 'foto.png',
  buffer = png,
  contentType = 'image/png',
) {
  return req.attach('files', buffer, { filename: nome, contentType });
}

test('recebe DTO e arquivos separados e retorna as imagens com o vínculo', async () => {
  const result = await imagem(imagem(enviar(), 'primeira.png'), 'segunda.png');
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const { dto, usuarioId: responsavel, files } = chamadas[0];
  assert.equal(responsavel, usuarioId);
  assert.equal(salvo.usuarioId, usuarioId);
  assert.ok(dto instanceof ImovelRequestDto);
  assert.equal(dto.valor, 450000);
  assert.equal(dto.condominioMensal, 0);
  assert.deepEqual(dto.comodidades, ['Jardim']);
  assert.equal(dto.imgs, undefined);
  assert.deepEqual(files[0].buffer, png);
  assert.deepEqual(
    files.map((file) => file.originalname),
    ['primeira.png', 'segunda.png'],
  );
  assert.deepEqual(
    imagensSalvas.map((img) => img.isPrimary),
    [true, false],
  );
  assert.ok(imagensSalvas.every((img) => img.imovelId === salvo.id));
  assert.ok(imagensSalvas.every((img) => img.usuarioId === null));
  assert.equal(uploads, 2);
  assert.deepEqual(result.body.imagens, imagensSalvas);
  assert.equal(result.body.valor, 450000);
  assert.equal(result.body.fotos, undefined);
});

test('rejeita JSON inválido ou ausente sem salvar dados', async () => {
  for (const dto of ['{inválido', undefined]) {
    const req = request(app.getHttpServer())
      .post('/imovel')
      .set('Authorization', `Bearer ${token()}`);
    if (dto !== undefined) req.field('dto', dto);
    assert.equal((await imagem(req)).status, 400);
  }
  assert.equal(uploads, 0);
  assert.equal(gravacoes, 0);
});

for (const dto of [null, [], 'texto', 123, true]) {
  test(`rejeita DTO que não é um objeto válido: ${JSON.stringify(dto)}`, async () => {
    assert.equal((await imagem(enviar(dto))).status, 400);
    assert.equal(uploads, 0);
    assert.equal(gravacoes, 0);
  });
}

test('aceita múltiplas comodidades e uma lista vazia', async () => {
  for (const comodidades of [['Jardim', 'Piscina'], []]) {
    const result = await imagem(enviar({ ...dados, comodidades }));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.deepEqual(result.body.comodidades, comodidades);
  }
});

test('aceita até 20 arquivos', async () => {
  let req = enviar();
  for (let index = 0; index < 20; index++)
    req = imagem(req, `foto-${index}.png`);
  const result = await req;
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(imagensSalvas.length, 20);
});

test('identifica o tipo real da imagem pelo conteúdo', async () => {
  const result = await imagem(enviar(), 'foto.jpg', png, 'image/jpeg');
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(chamadas[0].files[0].mimetype, 'image/png');
});

test('rejeita texto disfarçado de imagem antes do upload, mantendo o imóvel já salvo', async () => {
  const result = await imagem(
    enviar(),
    'foto.jpg',
    Buffer.from('texto'),
    'image/jpeg',
  );
  assert.equal(result.status, 400);
  assert.equal(uploads, 0);
  assert.equal(gravacoes, 1);
  assert.equal(salvo.id, imovelId);
  assert.deepEqual(imagensSalvas, []);
});

test('rejeita arquivo acima de 1 MB', async () => {
  const result = await imagem(enviar(), 'grande.png', Buffer.alloc(1048577));
  assert.equal(result.status, 413);
  assert.equal(uploads, 0);
});

test('rejeita mais de 20 arquivos', async () => {
  let req = enviar();
  for (let index = 0; index < 21; index++)
    req = imagem(req, `foto-${index}.png`);
  assert.equal((await req).status, 400);
  assert.equal(uploads, 0);
});

test('exige ao menos uma imagem', async () => {
  assert.equal((await enviar()).status, 400);
  assert.equal(uploads, 0);
});

test('aceita somente a chave files para os arquivos', async () => {
  const result = await enviar().attach('imgs', png, { filename: 'foto.png' });
  assert.equal(result.status, 400);
  assert.equal(uploads, 0);
});

test('exige a identidade autenticada', async () => {
  assert.equal((await imagem(enviar(dados, false))).status, 401);
  assert.equal(uploads, 0);
});

for (const alteracao of [
  { usuarioId },
  { destaque: true },
  { dados: '{}' },
  { valor: -1 },
  { tipo: 'house' },
  { estado: 'ZZ' },
  { quartos: 1.5 },
]) {
  test(`rejeita dados inválidos ou campos extras: ${JSON.stringify(alteracao)}`, async () => {
    const result = await imagem(enviar({ ...dados, ...alteracao }));
    assert.equal(result.status, 400);
    assert.equal(uploads, 0);
    assert.equal(gravacoes, 0);
  });
}

test('preserva o PATCH JSON dos dados sem apagar os campos omitidos', async () => {
  await imagem(enviar());
  const result = await request(app.getHttpServer())
    .patch(`/imovel/${imovelId}`)
    .set('Authorization', `Bearer ${token()}`)
    .send({ titulo: 'Título revisado', condominioMensal: 0 });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.titulo, 'Título revisado');
  assert.equal(result.body.condominioMensal, 0);
  assert.equal(result.body.valor, 450000);
  assert.deepEqual(result.body.comodidades, ['Jardim']);
});

test('usa o ID do usuário do token para criar o imóvel', async () => {
  const outroUsuarioId = '127776fd-43f6-469e-87df-609b399d4ef8';
  const result = await imagem(
    enviar(dados, false).set(
      'Authorization',
      `Bearer ${token(outroUsuarioId)}`,
    ),
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(chamadas[0].usuarioId, outroUsuarioId);
  assert.equal(salvo.usuarioId, outroUsuarioId);
  assert.equal(result.body.usuarioId, outroUsuarioId);
});

const claims = { sub: usuarioId, perfil: 'anunciante' };
const adulterado = token().split('.');
adulterado[1] = Buffer.from(
  JSON.stringify({
    ...claims,
    sub: '127776fd-43f6-469e-87df-609b399d4ef8',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
).toString('base64url');
for (const [descricao, invalido] of [
  ['vencido', jwt.sign(claims, { expiresIn: -1 })],
  ['adulterado', adulterado.join('.')],
  [
    'assinado com outra chave',
    new JwtService({ secret: 'chave-diferente-exclusiva-deste-teste' }).sign(
      claims,
      { expiresIn: 3600 },
    ),
  ],
  [
    'algoritmo diferente',
    jwt.sign(claims, { algorithm: 'HS384', expiresIn: 3600 }),
  ],
  ['sem expiração', jwt.sign(claims)],
  ['sem usuário', jwt.sign({ perfil: 'anunciante' }, { expiresIn: 3600 })],
  [
    'ID inválido',
    jwt.sign({ ...claims, sub: 'id-invalido' }, { expiresIn: 3600 }),
  ],
  [
    'perfil inválido',
    jwt.sign({ ...claims, perfil: 'outro' }, { expiresIn: 3600 }),
  ],
  ['sem perfil', jwt.sign({ sub: usuarioId }, { expiresIn: 3600 })],
]) {
  test(`rejeita token ${descricao} antes de criar ou enviar imagens`, async () => {
    const result = await imagem(
      enviar(dados, false).set('Authorization', `Bearer ${invalido}`),
    );
    assert.equal(result.status, 401, JSON.stringify(result.body));
    assert.equal(chamadas.length, 0);
    assert.equal(uploads, 0);
    assert.equal(gravacoes, 0);
  });
}

test('rejeita autenticação por header de usuário sem JWT', async () => {
  const result = await imagem(
    enviar(dados, false).set('x-test-user', usuarioId),
  );
  assert.equal(result.status, 401);
  assert.equal(chamadas.length, 0);
});

test('executa o guard antes de processar multipart de usuário anônimo', async () => {
  const result = await imagem(
    enviar(dados, false),
    'grande.png',
    Buffer.alloc(1048577),
  );
  assert.equal(result.status, 401);
  assert.equal(uploads, 0);
});

test('mantém a validação de conta ativa no service', async () => {
  usuarioAtivo = false;
  const result = await imagem(enviar());
  assert.equal(result.status, 403);
  assert.equal(uploads, 0);
  assert.equal(gravacoes, 0);
});

test('listagem e detalhes permanecem públicos', async () => {
  await imagem(enviar());
  const lista = await request(app.getHttpServer()).get('/imovel');
  const detalhe = await request(app.getHttpServer()).get(`/imovel/${imovelId}`);
  assert.equal(lista.status, 200);
  assert.equal(detalhe.status, 200);
});

test('edição e exclusão exigem token e respeitam o proprietário', async () => {
  await imagem(enviar());
  assert.equal(
    (
      await request(app.getHttpServer())
        .patch(`/imovel/${imovelId}`)
        .send({ titulo: 'Sem token' })
    ).status,
    401,
  );
  assert.equal(
    (await request(app.getHttpServer()).delete(`/imovel/${imovelId}`)).status,
    401,
  );
  const outro = token('127776fd-43f6-469e-87df-609b399d4ef8');
  assert.equal(
    (
      await request(app.getHttpServer())
        .patch(`/imovel/${imovelId}`)
        .set('Authorization', `Bearer ${outro}`)
        .send({ titulo: 'Outro usuário' })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app.getHttpServer())
        .delete(`/imovel/${imovelId}`)
        .set('Authorization', `Bearer ${outro}`)
    ).status,
    403,
  );
});
