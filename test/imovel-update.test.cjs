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
const { JwtService } = require('@nestjs/jwt');
const { ClassSerializerInterceptor, ValidationPipe } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const request = require('supertest');
const { ImovelController } = require('../dist/imovel/imovel.controller');
const { ImovelService } = require('../dist/imovel/imovel.service');
const { ImageService } = require('../dist/image/image.service');
const { JwtAuthGuard } = require('../dist/auth/jwt-auth.guard');
const cloudinaryConfig = require('../dist/config/cloudinary.config');

const usuarioId = '991c7dcb-499b-4071-9fe5-aa5792cb336a';
const imovelId = 'c6758db7-5121-44cb-a562-72a64dc36e2d';
const principalId = '00000000-0000-4000-8000-000000000001';
const segundaId = '00000000-0000-4000-8000-000000000002';
const avatarId = '00000000-0000-4000-8000-000000000003';
const jwt = new JwtService({ secret: 'chave-exclusiva-para-testes-de-edicao-imovel' });
const token = (id = usuarioId) => jwt.sign({ sub: id, perfil: 'anunciante' }, { expiresIn: 3600 });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
let app;
let imovel;
let imagens;
let uploads;
let removidas;
let usuarioAtivo;
let falharUpload;
let falharGravacao;

before(async () => {
  cloudinaryConfig.configureCloudinary = () => ({ uploader: {
    upload_stream: (_options, callback) => ({ end() {
      if (falharUpload) return callback({ message: 'Falha de upload simulada' });
      const publicId = `nova-${++uploads}`;
      callback(null, { public_id: publicId, secure_url: `https://example.com/${publicId}.png` });
    } }),
    async destroy(publicId) { removidas.push(publicId); return { result: 'ok' }; },
  } });
  const imageService = new ImageService({
    create: (input) => ({ ...input }),
    async save(entries) {
      for (const entry of entries) {
        entry.id ??= randomUUID();
        imagens.set(entry.id, { ...entry });
      }
      return entries;
    },
    async find(options) {
      return [...imagens.values()].filter((image) => options.where.id.value.includes(image.id)).map((image) => ({ ...image }));
    },
    async remove(image) { imagens.delete(image.id); },
  });
  const service = new ImovelService({
    async findOne() {
      if (!imovel) return null;
      return { ...imovel, imagens: [...imagens.values()].filter((image) => image.imovelId === imovelId).map((image) => ({ ...image })) };
    },
    merge(entity, changes) {
      for (const [field, value] of Object.entries(changes)) {
        if (value !== undefined) entity[field] = value;
      }
      return entity;
    },
    async save(entity) {
      if (falharGravacao) throw new Error('Falha de gravação simulada');
      // A relação salva deve incluir as fotos novas, para o TypeORM não desvinculá-las.
      for (const image of imagens.values()) {
        if (image.imovelId === imovelId) assert.ok(entity.imagens.some((linked) => linked.id === image.id));
      }
      const { imagens: _imagens, ...fields } = entity;
      imovel = { ...fields };
      return entity;
    },
  }, { async findOne(id) { return { id, ativo: usuarioAtivo, perfil: 'anunciante' }; } }, imageService);
  const module = await Test.createTestingModule({
    controllers: [ImovelController],
    providers: [
      { provide: ImovelService, useValue: service },
      { provide: JwtService, useValue: jwt },
      JwtAuthGuard,
    ],
  }).compile();
  app = module.createNestApplication();
  app.useLogger(false);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector), { excludeExtraneousValues: true }));
  await app.init();
});

beforeEach(() => {
  uploads = 0;
  removidas = [];
  usuarioAtivo = true;
  falharUpload = falharGravacao = false;
  imovel = { id: imovelId, usuarioId, titulo: 'Casa original', descricao: 'Casa ampla com jardim e uma localização tranquila.', tipo: 'casa', finalidade: 'venda', valor: '450000', condominioMensal: '0', iptuMensal: '50', cidade: 'Buriti Alegre', estado: 'GO', bairro: 'Centro', area: '150', quartos: 3, banheiros: 2, vagasGaragem: 1, comodidades: ['Jardim'] };
  imagens = new Map([
    [principalId, { id: principalId, url: 'https://example.com/principal.png', publicUrlId: 'antiga-principal', isPrimary: true, imovelId, usuarioId: null }],
    [segundaId, { id: segundaId, url: 'https://example.com/segunda.png', publicUrlId: 'antiga-segunda', isPrimary: false, imovelId, usuarioId: null }],
    [avatarId, { id: avatarId, url: 'https://example.com/avatar.png', publicUrlId: 'avatar', isPrimary: true, usuarioId, imovelId: null }],
  ]);
});
after(async () => { if (app) await app.close(); });

function editar(dto = {}, id = usuarioId) {
  return request(app.getHttpServer()).patch(`/imovel/${imovelId}`).set('Authorization', `Bearer ${token(id)}`).field('dto', JSON.stringify(dto));
}
function foto(req, name = 'foto.png', buffer = png) {
  return req.attach('files', buffer, { filename: name, contentType: 'image/png' });
}
function fotosDoImovel() { return [...imagens.values()].filter((image) => image.imovelId === imovelId); }

test('PATCH em JSON continua atualizando os dados e preserva as fotos', async () => {
  const response = await request(app.getHttpServer()).patch(`/imovel/${imovelId}`).set('Authorization', `Bearer ${token()}`).send({ titulo: 'Casa atualizada' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.titulo, 'Casa atualizada');
  assert.equal(response.body.imagens.length, 2);
  assert.equal(uploads, 0);
  assert.deepEqual(removidas, []);
});

test('adiciona várias fotos sem remover as existentes e mantém uma principal', async () => {
  const response = await foto(foto(editar({ titulo: 'Casa atualizada' }), 'sala.png'), 'quarto.png');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.imagens.length, 4);
  assert.ok(response.body.imagens.every((image) => image.imovelId === imovelId));
  assert.equal(response.body.imagens.filter((image) => image.isPrimary).length, 1);
  assert.equal(response.body.imagens.find((image) => image.isPrimary).id, principalId);
  assert.equal('imagensRemovidas' in response.body, false);
  assert.equal(uploads, 2);
  assert.deepEqual(removidas, []);
});

test('remove a principal e promove a próxima sem exigir arquivos novos', async () => {
  const response = await editar({ imagensRemovidas: [principalId] });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.imagens.length, 1);
  assert.equal(response.body.imagens[0].id, segundaId);
  assert.equal(response.body.imagens[0].isPrimary, true);
  assert.deepEqual(removidas, ['antiga-principal']);
  assert.ok(imagens.has(avatarId));
});

test('substitui todas as fotos preservando a foto do usuário', async () => {
  const response = await foto(foto(editar({ imagensRemovidas: [principalId, segundaId] }), 'nova-1.png'), 'nova-2.png');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.imagens.length, 2);
  assert.equal(response.body.imagens.filter((image) => image.isPrimary).length, 1);
  assert.deepEqual(removidas, ['antiga-principal', 'antiga-segunda']);
  assert.ok(imagens.has(avatarId));
});

test('rejeita IDs de outra relação, inválidos, repetidos e null antes de alterar fotos', async () => {
  for (const ids of [[avatarId], [randomUUID()], ['id-invalido'], [principalId, principalId], null]) {
    const response = await foto(editar({ imagensRemovidas: ids }));
    assert.equal(response.status, 400, JSON.stringify(response.body));
  }
  assert.equal(uploads, 0);
  assert.deepEqual(removidas, []);
  assert.equal(fotosDoImovel().length, 2);
});

test('impede remover todas as fotos sem adicionar outra', async () => {
  const response = await editar({ imagensRemovidas: [principalId, segundaId] });
  assert.equal(response.status, 400);
  assert.equal(fotosDoImovel().length, 2);
  assert.deepEqual(removidas, []);
});

test('o limite considera fotos mantidas e novas', async () => {
  let req = editar();
  for (let index = 0; index < 19; index++) req = foto(req, `foto-${index}.png`);
  const response = await req;
  assert.equal(response.status, 400);
  assert.equal(uploads, 0);
  assert.equal(fotosDoImovel().length, 2);
});

test('aceita exatamente 20 fotos no total', async () => {
  let req = editar();
  for (let index = 0; index < 18; index++) req = foto(req, `foto-${index}.png`);
  const response = await req;
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.imagens.length, 20);
  assert.equal(response.body.imagens.filter((image) => image.isPrimary).length, 1);
});

test('arquivo inválido não altera dados nem remove fotos antigas', async () => {
  const response = await foto(editar({ titulo: 'Não salvar', imagensRemovidas: [principalId] }), 'invalida.png', Buffer.from('não é uma imagem'));
  assert.equal(response.status, 400);
  assert.equal(imovel.titulo, 'Casa original');
  assert.equal(fotosDoImovel().length, 2);
  assert.deepEqual(removidas, []);
});

test('rejeita arquivo acima de 1 MB', async () => {
  const response = await foto(editar(), 'grande.png', Buffer.alloc(1048577));
  assert.equal(response.status, 413);
  assert.equal(uploads, 0);
});

test('rejeita DTO malformado, arrays e campos não permitidos', async () => {
  for (const dto of ['{', 'null', '[]', JSON.stringify({ usuarioId }), JSON.stringify({ valor: null })]) {
    const response = await request(app.getHttpServer()).patch(`/imovel/${imovelId}`).set('Authorization', `Bearer ${token()}`).field('dto', dto);
    assert.equal(response.status, 400, JSON.stringify(response.body));
  }
  assert.equal(uploads, 0);
});

test('exige token e impede outra conta ou usuário inativo de alterar fotos', async () => {
  assert.equal((await foto(request(app.getHttpServer()).patch(`/imovel/${imovelId}`).field('dto', '{}'))).status, 401);
  assert.equal((await foto(editar({}, randomUUID()))).status, 403);
  usuarioAtivo = false;
  assert.equal((await foto(editar())).status, 403);
  assert.equal(uploads, 0);
  assert.deepEqual(removidas, []);
});

test('falha de upload preserva os dados e as fotos anteriores', async () => {
  falharUpload = true;
  const response = await foto(editar({ titulo: 'Não salvar', imagensRemovidas: [principalId] }));
  assert.equal(response.status, 500);
  assert.equal(imovel.titulo, 'Casa original');
  assert.equal(fotosDoImovel().length, 2);
  assert.deepEqual(removidas, []);
});

test('falha ao salvar os dados limpa somente as fotos novas', async () => {
  falharGravacao = true;
  const response = await foto(editar({ titulo: 'Não salvar', imagensRemovidas: [principalId] }));
  assert.equal(response.status, 500);
  assert.equal(imovel.titulo, 'Casa original');
  assert.equal(fotosDoImovel().length, 2);
  assert.deepEqual(removidas, ['nova-1']);
  assert.ok(imagens.has(principalId));
});
