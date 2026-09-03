# Assets TUKU

Sprites creados con el modo integrado de `imagegen` para **TUKU: No Te Caigas**.

## Dirección común

Todos los objetos se solicitaron como pixel art auténtico de videojuego de 16 bits, sin antialiasing, sin texto ajeno a la marca, centrados y con margen amplio. Los objetos opacos se generaron sobre magenta uniforme `#FF00FF`; después se aplicó chroma key con despill y contracción de borde, recorte al alfa y reducción con nearest-neighbor.

## Prompts finales

- `ball-nebula.png`: balón deportivo TUKU esférico, azul noche y cian eléctrico, paneles futuristas, wordmark TUKU legible, vista lateral 3/4, listo para rotar como protagonista.
- `ball-fuego.png`: balón deportivo TUKU esférico, naranja volcánico, rojo y carbón, paneles energéticos, wordmark TUKU legible, vista lateral 3/4.
- `ball-oro.png`: balón deportivo TUKU esférico, marfil, dorado y negro, acabado campeonato, wordmark TUKU legible, vista lateral 3/4.
- `ball-metal.png`: balón deportivo TUKU esférico, plata, gris acero y azul frío, paneles técnicos, wordmark TUKU legible, vista lateral 3/4.
- `performance-token.png`: ficha circular de rendimiento TUKU, cian luminoso, microchip y rayo central, lectura clara a 32 px.
- `certification-core.png`: núcleo de certificación TUKU flotante, cian/blanco/naranja, energía tecnológica, valor visual equivalente a cinco fichas.
- `impact-block.png`: bloque industrial de prueba de impacto, acero oscuro, franjas naranjas, placa TUKU, silueta compatible con un obstáculo vertical.
- `calibration-drone.png`: dron de calibración industrial TUKU, compacto y horizontal, rotores protegidos, sensores cian y acentos naranjas.
- `impact-wave.png`: onda de impacto tecnológica circular, anillos cian y naranja, fragmentos de energía, centro transparente.
- `lab-background.png`: túnel industrial TUKU Lab 16:9, pasarela lateral, referencias sutiles a una cancha, metal grafito, luces cian y pequeños acentos naranja, profundidad en capas y zona jugable despejada.

## Archivos y escala

| Archivo | Dimensiones | Canal |
|---|---:|---|
| `ball-nebula.png` | 127×128 | RGBA |
| `ball-fuego.png` | 126×128 | RGBA |
| `ball-oro.png` | 126×128 | RGBA |
| `ball-metal.png` | 127×128 | RGBA |
| `performance-token.png` | 63×64 | RGBA |
| `certification-core.png` | 83×96 | RGBA |
| `impact-block.png` | 59×96 | RGBA |
| `calibration-drone.png` | 128×70 | RGBA |
| `impact-wave.png` | 128×124 | RGBA |
| `lab-background.png` | 1983×793 | RGB |

Los sprites RGBA tienen esquinas totalmente transparentes y no conservan halos magenta visibles.
