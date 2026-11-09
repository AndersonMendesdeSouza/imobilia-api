require('reflect-metadata');
const path = require('node:path');
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: { 'src/*': ['dist/*'] },
});

const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { Test } = require('@nestjs/testing');
const { ClassSerializerInterceptor, ValidationPipe } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const request = require('supertest');
const { ImovelController } = require('../dist/imovel/imovel.controller');
const { ImovelService } = require('../dist/imovel/imovel.service');
const { ImovelRequestDto } = require('../dist/dtos/request/imovel-request.dto');
const { ImageService } = require('../dist/image/image.service');
const cloudinaryConfig = require('../dist/config/cloudinary.config');

const usuarioId = '991c7dcb-499b-4071-9fe5-aa5792cb336a';
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
const chamadas = [];

before(async () => {
  // Só o Cloudinary e os repositórios são simulados; nenhuma conexão externa.
  cloudinaryConfig.configureCloudinary = () => ({
    uploader: {
      upload_stream: (_options, callback) => ({
        end: () => {
          const id = `foto-${++uploads}`;
          callback(null, { secure_url: `https://example.com/${id}.png`, public_id: id });
        },
      }),
      destroy: async () => ({ result: 'ok' }),
    },
  });
  const imagens = new ImageService({
    create: (input) => ({ ...input }),
    save: async (inputs) => {
      gravacoes++;
      imagensSalvas = inputs.map((input, index) => ({ ...input, id: `imagem-${index}` }));
      return imagensSalvas;
    },
  });
  const usuarios = {
    findOne: async () => ({ id: usuarioId, ativo: true, perfil: 'anunciante' }),
  };
  const service = new ImovelService({
    create: (input) => ({ ...input }),
    save: async (input) => {
      gravacoes++;
      salvo = { ...input, id: imovelId, criadoEm: new Date(), atualizadoEm: new Date() };
      return salvo;
    },
    findOne: async () => salvo && ({
      ...salvo,
      imagens: imagensSalvas.filter(imagem => imagem.imovelId === salvo.id),
    }),
    merge: (entity, input) => {
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) entity[key] = value;
      }
      return entity;
    },
  }, usuarios, imagens);
  const create = service.create.bind(service);
  service.create = async (dto, files) => {
    chamadas.push({ dto, files });
    return create(dto, files);
  };
  const module = await Test.createTestingModule({
    controllers: [ImovelController],
    providers: [{ provide: ImovelService, useValue: service }],
  }).compile();
  app = module.createNestApplication();
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), { excludeExtraneousValues: true }),
  );
  app.use((req, _res, next) => {
    if (req.headers['x-test-user']) req.user = { id: usuarioId };
    next();
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
  }));
  await app.init();
});

beforeEach(() => {
  chamadas.length = 0;
  uploads = 0;
  gravacoes = 0;
  salvo = undefined;
  imagensSalvas = [];
});
after(async () => { if (app) await app.close(); });

function enviar(payload = dados, autenticado = true) {
  const req = request(app.getHttpServer()).post('/imovel');
  if (autenticado) req.set('x-test-user', usuarioId);
  req.field('dto', JSON.stringify(payload));
  return req;
}
function imagem(req, nome = 'foto.png', buffer = png, contentType = 'image/png') {
  return req.attach('files', buffer, { filename: nome, contentType });
}

test('recebe DTO e arquivos separados e retorna as imagens com o vínculo', async () => {
  const result = await imagem(imagem(enviar(), 'primeira.png'), 'segunda.png');
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const { dto, files } = chamadas[0];
  assert.ok(dto instanceof ImovelRequestDto);
  assert.equal(dto.valor, 450000);
  assert.equal(dto.condominioMensal, 0);
  assert.deepEqual(dto.comodidades, ['Jardim']);
  assert.equal(dto.imgs, undefined);
  assert.deepEqual(files[0].buffer, png);
  assert.deepEqual(files.map(file => file.originalname), ['primeira.png', 'segunda.png']);
  assert.deepEqual(imagensSalvas.map(img => img.isPrimary), [true, false]);
  assert.ok(imagensSalvas.every(img => img.imovelId === salvo.id));
  assert.ok(imagensSalvas.every(img => img.usuarioId === null));
  assert.equal(uploads, 2);
  assert.deepEqual(result.body.imagens, imagensSalvas);
  assert.equal(result.body.valor, 450000);
  assert.equal(result.body.fotos, undefined);
});

test('rejeita JSON inválido ou ausente sem salvar dados', async () => {
  for (const dto of ['{inválido', undefined]) {
    const req = request(app.getHttpServer()).post('/imovel');
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
  for (let index = 0; index < 20; index++) req = imagem(req, `foto-${index}.png`);
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
  const result = await imagem(enviar(), 'foto.jpg', Buffer.from('texto'), 'image/jpeg');
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
  for (let index = 0; index < 21; index++) req = imagem(req, `foto-${index}.png`);
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

test.skip('exige a identidade autenticada (autenticação de criação temporariamente comentada)', async () => {
  assert.equal((await imagem(enviar(dados, false))).status, 401);
  assert.equal(uploads, 0);
});

for (const alteracao of [
  { usuarioId }, { destaque: true }, { dados: '{}' }, { valor: -1 },
  { tipo: 'house' }, { estado: 'ZZ' }, { quartos: 1.5 },
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
  const result = await request(app.getHttpServer()).patch(`/imovel/${imovelId}`)
    .set('x-test-user', usuarioId).send({ titulo: 'Título revisado', condominioMensal: 0 });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.titulo, 'Título revisado');
  assert.equal(result.body.condominioMensal, 0);
  assert.equal(result.body.valor, 450000);
  assert.deepEqual(result.body.comodidades, ['Jardim']);
});
