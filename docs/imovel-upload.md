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

O `PATCH /imovel/:id` continua recebendo os campos diretamente em JSON; não usa o envelope `dto` nem altera imagens. Edição e exclusão também exigem Bearer Token e mantêm a verificação de proprietário ou administrador. `GET /imovel` e `GET /imovel/:id` continuam públicos.

`npm run test:multipart` verifica esse contrato HTTP com banco e Cloudinary simulados.
