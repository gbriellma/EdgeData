# Identidade visual

O símbolo do EdgeData é uma folha cuja nervura central é um sinal de sensor: o campo e o dado
na mesma forma. A geometria fica em [`symbol.mjs`](symbol.mjs) e todas as imagens são geradas a
partir dela por [`build.mjs`](build.mjs).

```bash
cd design/brand
npm install
npm run build
```

| Saída | Uso |
|---|---|
| `apps/mobile/assets/images/icon.png` | Ícone do app (iOS e fallback), 1024×1024 |
| `apps/mobile/assets/images/android-icon-{background,foreground,monochrome}.png` | Ícone adaptativo do Android; o símbolo fica dentro da área segura (66 dp de 108 dp) |
| `apps/mobile/assets/images/splash-icon.png` | Tela de abertura (fundo `#FAFAFA`) |
| `apps/mobile/assets/images/favicon.png` | Web |
| `store/play-icon-512.png` | Ícone da Play Store |
| `store/feature-graphic-1024x500.png` | Arte de destaque da Play Store |
| `svg/*.svg` | Versões vetoriais de cada peça |

## Cores

| Papel | Cor |
|---|---|
| Fundo escuro (degradê) | `#1E6A3A` → `#0E3A22` |
| Folha sobre fundo escuro (degradê) | `#34A457` → `#8BE06A` |
| Folha sobre fundo claro (degradê) | `#1B5E20` → `#4CAF50` |
| Destaque | `#B9F09A` |
| Primária do app | `#2E7D32` |

Tipografia das artes: Inter (800 no nome, 600 no slogan, 400 no texto).
