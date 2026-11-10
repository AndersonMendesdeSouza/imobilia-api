# Criar imóvel com imagens pelo Postman

Use `POST /imovel` com **Authorization → Bearer Token**, preenchendo o token retornado por `POST /user/login`. Em **Body → form-data**, envie o DTO inteiro como JSON no campo `dto` e as imagens em `files`.

| Campo | Tipo | Conteúdo |
| --- | --- | --- |
| dto | Text | JSON abaixo |
| files | File | primeira-foto.jpg |
| files | File | segunda-foto.jpg, se houver |

Conteúdo do campo `dto`:

```json
{
  "titulo": "Casa com jardim",
  "descricao": "Casa ampla com sala integrada, cozinha planejada e jardim espaçoso.",
  "tipo": "casa",
  "finalidade": "venda",
  "valor": 450000,
  "condominioMensal": 0,
  "iptuMensal": 120,
  "cidade": "Buriti Alegre",
  "estado": "GO",
  "bairro": "Centro",
  "area": 180,
  "quartos": 3,
  "banheiros": 2,
  "vagasGaragem": 2,
  "comodidades": ["Jardim", "Churrasqueira"]
}
```

Sem comodidades, use `"comodidades": []`. Não envie os campos do imóvel diretamente na raiz do formulário: agora eles pertencem ao JSON `dto`.

No front, `api.postForm('/imovel', { dto: JSON.stringify(dto), files }, { formSerializer: { indexes: null } })` monta o multipart automaticamente. `indexes: null` mantém a chave dos arquivos como `files`, sem colchetes. O controller lê o JSON, valida `ImovelRequestDto` e passa o DTO e os arquivos separados ao service.

São aceitas de 1 a 20 imagens JPG, PNG ou WebP, de até 1 MB cada. A primeira é a principal. Não defina o `Content-Type` manualmente no Postman.

O `JwtAuthGuard` valida assinatura HS256 e expiração e preenche `request.user.id` a partir de `sub`. O controller passa esse ID ao service; o proprietário não vem do formulário. O ID fixo foi removido. Token ausente, vencido ou adulterado retorna 401 antes do processamento dos arquivos. A conta precisa continuar ativa para publicar.

## Editar dados e fotos

O `PATCH /imovel/:id` aceita os campos diretamente em JSON ou `form-data` com o JSON em `dto` e os novos arquivos em `files`, no mesmo formato da criação. O DTO da edição pode conter apenas os campos alterados.

Para remover fotos existentes, inclua seus IDs em `imagensRemovidas` dentro do JSON `dto`:

```json
{
  "titulo": "Casa com jardim atualizada",
  "imagensRemovidas": ["00000000-0000-4000-8000-000000000001"]
}
```

Use IDs retornados em `imagens` pelo GET do imóvel. As fotos que não estiverem nessa lista são mantidas. Não reenvie suas URLs ou arquivos. Para adicionar fotos, envie os arquivos novos em campos `files` repetidos. No front, `api.patchForm` monta esse formulário.

O total de fotos mantidas e novas deve ficar entre 1 e 20. A principal atual é preservada; se for removida, a próxima foto mantida assume o lugar, ou a primeira nova quando todas as anteriores forem removidas. A API verifica se os IDs pertencem ao imóvel e remove as fotos selecionadas do banco e do Cloudinary.

No formulário, selecionar arquivos e usar o X só altera as prévias. O envio e as exclusões acontecem ao salvar. Se o upload falhar, as fotos antigas são preservadas. A exclusão no Cloudinary não é transacional: se falhar após apagar parte das fotos, as que já foram apagadas não são restauradas; recarregue o anúncio antes de tentar novamente.

Edição e exclusão exigem Bearer Token e mantêm a verificação de proprietário ou administrador. `GET /imovel` e `GET /imovel/:id` continuam públicos.

`npm run test:multipart` verifica esse contrato HTTP com banco e Cloudinary simulados.

Após compilar a API, `node --test test/imovel-update.test.cjs` verifica adição, remoção e troca da principal, limites, permissões, compatibilidade com JSON e falhas de upload e gravação, com banco e Cloudinary simulados.
